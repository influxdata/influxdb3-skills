// Admin lifecycle example for InfluxDB 3 Enterprise via HTTP.
//
// Exercises the full token + database lifecycle (10 steps).
// Cleanup uses defer'd best-effort revocations so partial failures don't orphan.
//
// Requires InfluxDB 3 Enterprise or InfluxDB 3 Cloud (creates scoped resource tokens via
// /api/v3/enterprise/configure/token). Does NOT run on Core — Core has no
// resource tokens (POST /api/v3/configure/token returns 404), so step 3 fails.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type adminClient struct {
	host       string
	adminToken string
	httpc      *http.Client
}

func (c *adminClient) req(method, path string, body any) (*http.Response, error) {
	var br io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		br = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, c.host+path, br)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.adminToken)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return c.httpc.Do(req)
}

func (c *adminClient) listDBs() ([]string, error) {
	r, err := c.req("GET", "/api/v3/configure/database?format=json", nil)
	if err != nil {
		return nil, err
	}
	defer r.Body.Close()
	if r.StatusCode >= 400 {
		b, _ := io.ReadAll(r.Body)
		return nil, fmt.Errorf("list dbs: HTTP %d: %s", r.StatusCode, b)
	}
	var rows []map[string]string
	if err := json.NewDecoder(r.Body).Decode(&rows); err != nil {
		return nil, err
	}
	dbs := make([]string, 0, len(rows))
	for _, row := range rows {
		dbs = append(dbs, row["iox::database"])
	}
	return dbs, nil
}

func (c *adminClient) createDB(db string) error {
	r, err := c.req("POST", "/api/v3/configure/database", map[string]string{"db": db})
	if err != nil {
		return err
	}
	defer r.Body.Close()
	if r.StatusCode >= 400 {
		b, _ := io.ReadAll(r.Body)
		return fmt.Errorf("create db: HTTP %d: %s", r.StatusCode, b)
	}
	return nil
}

func (c *adminClient) deleteDB(db string) error {
	r, err := c.req("DELETE", "/api/v3/configure/database?db="+url.QueryEscape(db), nil)
	if err != nil {
		return err
	}
	defer r.Body.Close()
	if r.StatusCode >= 400 && r.StatusCode != http.StatusNotFound {
		b, _ := io.ReadAll(r.Body)
		return fmt.Errorf("delete db: HTTP %d: %s", r.StatusCode, b)
	}
	return nil
}

func (c *adminClient) createScopedToken(name, db string) (string, error) {
	body := map[string]any{
		"type":       "resource",
		"token_name": name,
		"permissions": []map[string]any{
			{
				"resource_type":  "db",
				"resource_names": []string{db},
				"actions":        []string{"read", "write"},
			},
		},
	}
	r, err := c.req("POST", "/api/v3/enterprise/configure/token", body)
	if err != nil {
		return "", err
	}
	defer r.Body.Close()
	if r.StatusCode >= 400 {
		b, _ := io.ReadAll(r.Body)
		return "", fmt.Errorf("create token %s: HTTP %d: %s", name, r.StatusCode, b)
	}
	var resp map[string]any
	if err := json.NewDecoder(r.Body).Decode(&resp); err != nil {
		return "", err
	}
	tok, _ := resp["token"].(string)
	if tok == "" {
		return "", fmt.Errorf("no token in response")
	}
	return tok, nil
}

func (c *adminClient) deleteToken(name string) error {
	r, err := c.req("DELETE", "/api/v3/configure/token?token_name="+url.QueryEscape(name), nil)
	if err != nil {
		return err
	}
	defer r.Body.Close()
	if r.StatusCode >= 400 && r.StatusCode != http.StatusNotFound {
		b, _ := io.ReadAll(r.Body)
		return fmt.Errorf("delete token: HTTP %d: %s", r.StatusCode, b)
	}
	return nil
}

func (c *adminClient) querySQL(db, q string, params map[string]any) ([]map[string]any, error) {
	body := map[string]any{"db": db, "q": q}
	if params != nil {
		body["params"] = params // bind values as $name — never string-concatenate into q
	}
	r, err := c.req("POST", "/api/v3/query_sql", body)
	if err != nil {
		return nil, err
	}
	defer r.Body.Close()
	if r.StatusCode >= 400 {
		b, _ := io.ReadAll(r.Body)
		return nil, fmt.Errorf("query: HTTP %d: %s", r.StatusCode, b)
	}
	var rows []map[string]any
	if err := json.NewDecoder(r.Body).Decode(&rows); err != nil {
		return nil, err
	}
	return rows, nil
}

func writePoint(host, scopedToken, db, line string) (int, error) {
	req, _ := http.NewRequest("POST",
		host+"/api/v3/write_lp?db="+url.QueryEscape(db)+"&precision=second",
		strings.NewReader(line))
	req.Header.Set("Authorization", "Bearer "+scopedToken)
	r, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer r.Body.Close()
	return r.StatusCode, nil
}

func main() {
	_ = godotenv.Load()
	host := os.Getenv("INFLUXDB_HOST")
	admin := os.Getenv("INFLUXDB_TOKEN")
	if host == "" || admin == "" {
		fmt.Fprintln(os.Stderr, "INFLUXDB_HOST and INFLUXDB_TOKEN are required")
		os.Exit(1)
	}

	c := &adminClient{host: host, adminToken: admin, httpc: &http.Client{Timeout: 10 * time.Second}}
	ts := time.Now().Unix()
	testDB := fmt.Sprintf("admin_test_go_%d", ts)
	tokenA := fmt.Sprintf("admin_test_go_token_%d_a", ts)
	tokenB := fmt.Sprintf("admin_test_go_token_%d_b", ts)

	type state struct {
		db, tokenA, tokenB string
	}
	st := &state{}
	defer func() {
		if st.tokenA != "" {
			if err := c.deleteToken(st.tokenA); err != nil {
				fmt.Println("  cleanup: token A:", err)
			}
		}
		if st.tokenB != "" {
			if err := c.deleteToken(st.tokenB); err != nil {
				fmt.Println("  cleanup: token B:", err)
			}
		}
		if st.db != "" {
			if err := c.deleteDB(st.db); err != nil {
				fmt.Println("  cleanup: DB:", err)
			}
		}
	}()

	must := func(label string, err error) {
		if err != nil {
			fmt.Println(label, err)
			os.Exit(1)
		}
	}

	fmt.Println("==> step 1: list databases")
	dbs, err := c.listDBs()
	must("list:", err)
	fmt.Printf("   %d databases\n", len(dbs))

	fmt.Printf("==> step 2: create %s\n", testDB)
	must("create db:", c.createDB(testDB))
	st.db = testDB

	fmt.Printf("==> step 3: create scoped token A for %s\n", testDB)
	scopedA, err := c.createScopedToken(tokenA, testDB)
	must("create token A:", err)
	st.tokenA = tokenA
	fmt.Printf("  ok (secret captured, length %d)\n", len(scopedA))

	fmt.Println("==> step 4: write a point with token A")
	now := time.Now().Unix()
	sc, err := writePoint(host, scopedA, testDB, fmt.Sprintf("lifecycle_test,host=h1 value=1.0 %d", now))
	must("write A:", err)
	fmt.Printf("  HTTP %d\n", sc)
	if sc < 200 || sc >= 300 {
		os.Exit(1)
	}

	fmt.Printf("==> step 5: list tokens via SQL, find %s\n", tokenA)
	rows, err := c.querySQL("_internal", "SELECT name FROM system.tokens WHERE name = $name", map[string]any{"name": tokenA})
	must("list tokens:", err)
	matches := 0
	for _, r := range rows {
		if r["name"] == tokenA {
			matches++
		}
	}
	fmt.Printf("  found: %d\n", matches)
	if matches == 0 {
		os.Exit(1)
	}

	fmt.Printf("==> step 6: rotate — create scoped token B for %s\n", testDB)
	scopedB, err := c.createScopedToken(tokenB, testDB)
	must("create token B:", err)
	st.tokenB = tokenB

	fmt.Println("==> step 7: verify B, delete A")
	sc, err = writePoint(host, scopedB, testDB, fmt.Sprintf("lifecycle_test,host=h1 value=2.0 %d", now+1))
	must("write B:", err)
	if sc < 200 || sc >= 300 {
		os.Exit(1)
	}
	must("delete A:", c.deleteToken(tokenA))
	st.tokenA = ""

	fmt.Printf("==> step 8: delete %s\n", testDB)
	must("delete db:", c.deleteDB(testDB))
	st.db = ""

	fmt.Println("==> step 9: delete token B")
	must("delete B:", c.deleteToken(tokenB))
	st.tokenB = ""

	fmt.Println("==> step 10: orphan check")
	dbsEnd, _ := c.listDBs()
	var dbOrph []string
	for _, d := range dbsEnd {
		if strings.HasPrefix(d, "admin_test_go_") {
			dbOrph = append(dbOrph, d)
		}
	}
	rowsEnd, _ := c.querySQL("_internal", "SELECT name FROM system.tokens WHERE name LIKE 'admin_test_go_%'", nil)
	var tokOrph []string
	for _, r := range rowsEnd {
		if name, _ := r["name"].(string); strings.HasPrefix(name, "admin_test_go_") {
			tokOrph = append(tokOrph, name)
		}
	}
	if len(dbOrph) == 0 {
		fmt.Println("  database orphans: <none>")
	} else {
		fmt.Println("  database orphans:", dbOrph)
		os.Exit(1)
	}
	if len(tokOrph) == 0 {
		fmt.Println("  token orphans:    <none>")
	} else {
		fmt.Println("  token orphans:   ", tokOrph)
		os.Exit(1)
	}

	fmt.Println("==> Done. Lifecycle completed cleanly.")
}
