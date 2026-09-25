using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using DotNetEnv;

namespace InfluxAdmin;

public static class AdminLifecycle
{
    static HttpClient _http = new();
    static string _adminToken = "";

    static HttpRequestMessage Authed(HttpMethod method, string path)
    {
        var req = new HttpRequestMessage(method, path);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _adminToken);
        return req;
    }

    static async Task<JsonDocument> GetJsonAsync(string path)
    {
        using var req = Authed(HttpMethod.Get, path);
        using var r = await _http.SendAsync(req);
        r.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await r.Content.ReadAsStringAsync());
    }

    static async Task<List<string>> ListDbsAsync()
    {
        using var doc = await GetJsonAsync("/api/v3/configure/database?format=json");
        var dbs = new List<string>();
        foreach (var el in doc.RootElement.EnumerateArray())
            dbs.Add(el.GetProperty("iox::database").GetString()!);
        return dbs;
    }

    static async Task CreateDbAsync(string db)
    {
        using var req = Authed(HttpMethod.Post, "/api/v3/configure/database");
        req.Content = new StringContent($"{{\"db\":\"{db}\"}}", Encoding.UTF8, "application/json");
        using var r = await _http.SendAsync(req);
        r.EnsureSuccessStatusCode();
    }

    static async Task DeleteDbAsync(string db)
    {
        using var req = Authed(HttpMethod.Delete, $"/api/v3/configure/database?db={Uri.EscapeDataString(db)}");
        using var r = await _http.SendAsync(req);
        if ((int)r.StatusCode >= 400 && r.StatusCode != System.Net.HttpStatusCode.NotFound)
            r.EnsureSuccessStatusCode();
    }

    static async Task<string> CreateScopedTokenAsync(string name, string db)
    {
        using var req = Authed(HttpMethod.Post, "/api/v3/enterprise/configure/token");
        var body = JsonSerializer.Serialize(new
        {
            type = "resource",
            token_name = name,
            permissions = new[] {
                new {
                    resource_type = "db",
                    resource_names = new[] { db },
                    actions = new[] { "read", "write" }
                }
            }
        });
        req.Content = new StringContent(body, Encoding.UTF8, "application/json");
        using var r = await _http.SendAsync(req);
        r.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await r.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("token").GetString()
            ?? throw new InvalidOperationException("no token in response");
    }

    static async Task DeleteTokenAsync(string name)
    {
        using var req = Authed(HttpMethod.Delete, $"/api/v3/configure/token?token_name={Uri.EscapeDataString(name)}");
        using var r = await _http.SendAsync(req);
        if ((int)r.StatusCode >= 400 && r.StatusCode != System.Net.HttpStatusCode.NotFound)
            r.EnsureSuccessStatusCode();
    }

    static async Task<JsonDocument> QuerySqlAsync(string db, string q, IDictionary<string, object>? queryParams = null)
    {
        using var req = Authed(HttpMethod.Post, "/api/v3/query_sql");
        var payload = new Dictionary<string, object> { ["db"] = db, ["q"] = q };
        if (queryParams != null) payload["params"] = queryParams; // bind values as $name — never concatenate into q
        var body = JsonSerializer.Serialize(payload);
        req.Content = new StringContent(body, Encoding.UTF8, "application/json");
        using var r = await _http.SendAsync(req);
        r.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await r.Content.ReadAsStringAsync());
    }

    static async Task<int> WritePointAsync(string scopedToken, string db, string line)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post,
            $"/api/v3/write_lp?db={Uri.EscapeDataString(db)}&precision=second");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", scopedToken);
        req.Content = new StringContent(line, Encoding.UTF8);
        using var r = await _http.SendAsync(req);
        return (int)r.StatusCode;
    }

    public static async Task Main()
    {
        Env.Load();
        var host = Environment.GetEnvironmentVariable("INFLUXDB_HOST")
            ?? throw new InvalidOperationException("INFLUXDB_HOST required");
        _adminToken = Environment.GetEnvironmentVariable("INFLUXDB_TOKEN")
            ?? throw new InvalidOperationException("INFLUXDB_TOKEN required");
        _http = new HttpClient { BaseAddress = new Uri(host), Timeout = TimeSpan.FromSeconds(10) };

        var ts = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var testDb = $"admin_test_csharp_{ts}";
        var tokenA = $"admin_test_csharp_token_{ts}_a";
        var tokenB = $"admin_test_csharp_token_{ts}_b";

        var state = new Dictionary<string, string>();

        try
        {
            Console.WriteLine("==> step 1: list databases");
            Console.WriteLine($"   {(await ListDbsAsync()).Count} databases");

            Console.WriteLine($"==> step 2: create {testDb}");
            await CreateDbAsync(testDb);
            state["db"] = testDb;

            Console.WriteLine($"==> step 3: create scoped token A for {testDb}");
            var scopedA = await CreateScopedTokenAsync(tokenA, testDb);
            state["tokenA"] = tokenA;
            Console.WriteLine($"  ok (secret captured, length {scopedA.Length})");

            Console.WriteLine("==> step 4: write a point with token A");
            var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            var sc1 = await WritePointAsync(scopedA, testDb, $"lifecycle_test,host=h1 value=1.0 {now}");
            Console.WriteLine($"  HTTP {sc1}");
            if (sc1 < 200 || sc1 >= 300) throw new Exception($"write returned {sc1}");

            Console.WriteLine($"==> step 5: list tokens via SQL, find {tokenA}");
            using (var doc = await QuerySqlAsync("_internal", "SELECT name FROM system.tokens WHERE name = $name",
                       new Dictionary<string, object> { ["name"] = tokenA }))
            {
                int matches = 0;
                foreach (var el in doc.RootElement.EnumerateArray())
                    if (el.TryGetProperty("name", out var n) && n.GetString() == tokenA) matches++;
                Console.WriteLine($"  found: {matches}");
                if (matches == 0) throw new Exception("token A not found");
            }

            Console.WriteLine($"==> step 6: rotate — create scoped token B for {testDb}");
            var scopedB = await CreateScopedTokenAsync(tokenB, testDb);
            state["tokenB"] = tokenB;

            Console.WriteLine("==> step 7: verify B, delete A");
            var sc2 = await WritePointAsync(scopedB, testDb, $"lifecycle_test,host=h1 value=2.0 {now + 1}");
            if (sc2 < 200 || sc2 >= 300) throw new Exception($"write with B returned {sc2}");
            await DeleteTokenAsync(tokenA);
            state.Remove("tokenA");

            Console.WriteLine($"==> step 8: delete {testDb}");
            await DeleteDbAsync(testDb);
            state.Remove("db");

            Console.WriteLine("==> step 9: delete token B");
            await DeleteTokenAsync(tokenB);
            state.Remove("tokenB");

            Console.WriteLine("==> step 10: orphan check");
            var dbOrph = new List<string>();
            foreach (var d in await ListDbsAsync())
                if (d.StartsWith("admin_test_csharp_")) dbOrph.Add(d);
            using (var doc = await QuerySqlAsync("_internal", "SELECT name FROM system.tokens WHERE name LIKE 'admin_test_csharp_%'"))
            {
                var tokOrph = new List<string>();
                foreach (var el in doc.RootElement.EnumerateArray())
                {
                    if (el.TryGetProperty("name", out var n))
                    {
                        var name = n.GetString() ?? "";
                        if (name.StartsWith("admin_test_csharp_")) tokOrph.Add(name);
                    }
                }
                Console.WriteLine($"  database orphans: {(dbOrph.Count == 0 ? "<none>" : string.Join(",", dbOrph))}");
                Console.WriteLine($"  token orphans:    {(tokOrph.Count == 0 ? "<none>" : string.Join(",", tokOrph))}");
                if (dbOrph.Count > 0 || tokOrph.Count > 0) throw new Exception("orphans found");
            }

            Console.WriteLine("==> Done. Lifecycle completed cleanly.");
        }
        finally
        {
            if (state.TryGetValue("tokenA", out var ta))
                try { await DeleteTokenAsync(ta); } catch (Exception e) { Console.WriteLine($"  cleanup A: {e.Message}"); }
            if (state.TryGetValue("tokenB", out var tb))
                try { await DeleteTokenAsync(tb); } catch (Exception e) { Console.WriteLine($"  cleanup B: {e.Message}"); }
            if (state.TryGetValue("db", out var d))
                try { await DeleteDbAsync(d); } catch (Exception e) { Console.WriteLine($"  cleanup db: {e.Message}"); }
        }
    }
}
