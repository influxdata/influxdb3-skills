import io.github.cdimascio.dotenv.Dotenv;
import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

public class AdminLifecycle {
    static String host;
    static String adminToken;
    static HttpClient httpc;

    static HttpRequest.Builder authed(String path) {
        return HttpRequest.newBuilder().uri(URI.create(host + path))
            .timeout(Duration.ofSeconds(10))
            .header("Authorization", "Bearer " + adminToken);
    }

    static String send(HttpRequest req) throws Exception {
        HttpResponse<String> r = httpc.send(req, HttpResponse.BodyHandlers.ofString());
        if (r.statusCode() >= 400 && r.statusCode() != 404) {
            throw new RuntimeException("HTTP " + r.statusCode() + ": " + r.body());
        }
        return r.body();
    }

    static int statusOnly(HttpRequest req) throws Exception {
        return httpc.send(req, HttpResponse.BodyHandlers.ofString()).statusCode();
    }

    static java.util.List<String> listDbs() throws Exception {
        String body = send(authed("/api/v3/configure/database?format=json").GET().build());
        JSONArray arr = new JSONArray(body);
        java.util.List<String> out = new java.util.ArrayList<>();
        for (int i = 0; i < arr.length(); i++) out.add(arr.getJSONObject(i).getString("iox::database"));
        return out;
    }

    static void createDb(String db) throws Exception {
        send(authed("/api/v3/configure/database")
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(new JSONObject(Map.of("db", db)).toString()))
            .build());
    }

    static void deleteDb(String db) throws Exception {
        send(authed("/api/v3/configure/database?db=" + URLEncoder.encode(db, StandardCharsets.UTF_8))
            .DELETE().build());
    }

    static String createScopedToken(String name, String db) throws Exception {
        JSONObject perm = new JSONObject()
            .put("resource_type", "db")
            .put("resource_names", new JSONArray().put(db))
            .put("actions", new JSONArray().put("read").put("write"));
        JSONObject body = new JSONObject()
            .put("type", "resource")
            .put("token_name", name)
            .put("permissions", new JSONArray().put(perm));
        String resp = send(authed("/api/v3/enterprise/configure/token")
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
            .build());
        return new JSONObject(resp).getString("token");
    }

    static void deleteToken(String name) throws Exception {
        send(authed("/api/v3/configure/token?token_name=" + URLEncoder.encode(name, StandardCharsets.UTF_8))
            .DELETE().build());
    }

    static JSONArray querySql(String db, String q) throws Exception {
        JSONObject body = new JSONObject().put("db", db).put("q", q);
        String resp = send(authed("/api/v3/query_sql")
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
            .build());
        return new JSONArray(resp);
    }

    static int writePoint(String scopedToken, String db, String line) throws Exception {
        HttpRequest req = HttpRequest.newBuilder()
            .uri(URI.create(host + "/api/v3/write_lp?db=" + URLEncoder.encode(db, StandardCharsets.UTF_8) + "&precision=second"))
            .header("Authorization", "Bearer " + scopedToken)
            .POST(HttpRequest.BodyPublishers.ofString(line))
            .build();
        return statusOnly(req);
    }

    public static void main(String[] args) throws Exception {
        Dotenv dotenv = Dotenv.configure().ignoreIfMissing().load();
        host = dotenv.get("INFLUXDB_HOST", System.getenv("INFLUXDB_HOST"));
        adminToken = dotenv.get("INFLUXDB_TOKEN", System.getenv("INFLUXDB_TOKEN"));
        if (host == null || adminToken == null) {
            System.err.println("INFLUXDB_HOST and INFLUXDB_TOKEN are required");
            System.exit(1);
        }
        httpc = HttpClient.newHttpClient();

        long ts = System.currentTimeMillis() / 1000L;
        String testDb = "admin_test_java_" + ts;
        String tokenA = "admin_test_java_token_" + ts + "_a";
        String tokenB = "admin_test_java_token_" + ts + "_b";

        Map<String, String> state = new HashMap<>();

        try {
            System.out.println("==> step 1: list databases");
            System.out.println("   " + listDbs().size() + " databases");

            System.out.println("==> step 2: create " + testDb);
            createDb(testDb);
            state.put("db", testDb);

            System.out.println("==> step 3: create scoped token A for " + testDb);
            String scopedA = createScopedToken(tokenA, testDb);
            state.put("tokenA", tokenA);
            System.out.println("  ok (secret captured, length " + scopedA.length() + ")");

            System.out.println("==> step 4: write a point with token A");
            long now = System.currentTimeMillis() / 1000L;
            int sc1 = writePoint(scopedA, testDb, "lifecycle_test,host=h1 value=1.0 " + now);
            System.out.println("  HTTP " + sc1);
            if (sc1 < 200 || sc1 >= 300) throw new RuntimeException("write returned " + sc1);

            System.out.println("==> step 5: list tokens via SQL, find " + tokenA);
            JSONArray rows = querySql("_internal", "SELECT name FROM system.tokens WHERE name = '" + tokenA + "'");
            int matches = 0;
            for (int i = 0; i < rows.length(); i++) {
                if (tokenA.equals(rows.getJSONObject(i).optString("name"))) matches++;
            }
            System.out.println("  found: " + matches);
            if (matches == 0) throw new RuntimeException("token A not found");

            System.out.println("==> step 6: rotate — create scoped token B for " + testDb);
            String scopedB = createScopedToken(tokenB, testDb);
            state.put("tokenB", tokenB);

            System.out.println("==> step 7: verify B, delete A");
            int sc2 = writePoint(scopedB, testDb, "lifecycle_test,host=h1 value=2.0 " + (now + 1));
            if (sc2 < 200 || sc2 >= 300) throw new RuntimeException("write with B returned " + sc2);
            deleteToken(tokenA);
            state.remove("tokenA");

            System.out.println("==> step 8: delete " + testDb);
            deleteDb(testDb);
            state.remove("db");

            System.out.println("==> step 9: delete token B");
            deleteToken(tokenB);
            state.remove("tokenB");

            System.out.println("==> step 10: orphan check");
            java.util.List<String> dbOrph = new java.util.ArrayList<>();
            for (String d : listDbs()) if (d.startsWith("admin_test_java_")) dbOrph.add(d);
            JSONArray rowsEnd = querySql("_internal", "SELECT name FROM system.tokens WHERE name LIKE 'admin_test_java_%'");
            java.util.List<String> tokOrph = new java.util.ArrayList<>();
            for (int i = 0; i < rowsEnd.length(); i++) {
                String name = rowsEnd.getJSONObject(i).optString("name", "");
                if (name.startsWith("admin_test_java_")) tokOrph.add(name);
            }
            System.out.println("  database orphans: " + (dbOrph.isEmpty() ? "<none>" : dbOrph));
            System.out.println("  token orphans:    " + (tokOrph.isEmpty() ? "<none>" : tokOrph));
            if (!dbOrph.isEmpty() || !tokOrph.isEmpty()) throw new RuntimeException("orphans found");

            System.out.println("==> Done. Lifecycle completed cleanly.");
        } finally {
            if (state.containsKey("tokenA")) try { deleteToken(state.get("tokenA")); } catch (Exception e) { System.out.println("  cleanup A: " + e.getMessage()); }
            if (state.containsKey("tokenB")) try { deleteToken(state.get("tokenB")); } catch (Exception e) { System.out.println("  cleanup B: " + e.getMessage()); }
            if (state.containsKey("db")) try { deleteDb(state.get("db")); } catch (Exception e) { System.out.println("  cleanup db: " + e.getMessage()); }
        }
    }
}
