# InfluxDB 3 Ops Quirks — Non-obvious Operator Behaviors

An ops-focused catalogue of "this is just how it is" behaviors an operator hits when running InfluxDB 3. Each entry: **What you'll see → Why it's that way → What to do.** Entries are bounded — only quirks that are verified against a real release and genuinely non-obvious.

> Verified against InfluxDB 3 Enterprise 3.10.0 on 2026-06-03. Cloud-flavor behavior may differ.

---

## 1. `/metrics` requires authentication

**What you'll see:** A Prometheus scrape of `/metrics` returns `401` with no body. Unlike a typical Prometheus exporter, the endpoint is not open.

**Why:** InfluxDB 3's `/metrics` endpoint is gated behind the same auth as the rest of the API — it requires an `Authorization: Bearer <token>` header.

**What to do:** Put the token in your Prometheus scrape config (`authorization` block with `credentials` / `credentials_file`, or the older `bearer_token` / `bearer_token_file`). Setup detail in `references/observability.md`.

---

## 2. There is no "series cardinality exceeded" error in v3

**What you'll see:** Writes that would have been rejected (or that blew up memory) on v1/v2 TSM are accepted without complaint, no matter how many unique tag combinations they create.

**Why:** InfluxDB 3 supports effectively unbounded series cardinality — a major architectural change from the v1/v2 TSM index. High cardinality still costs memory and query time, but it never causes a write to be rejected.

**What to do:** Don't chase a cardinality-limit error; it doesn't exist. The real hard limits are max databases, max tables, and max columns-per-table. Tuning and the actual limits are in `references/cardinality.md`.

---

## 3. Retention enforcement is scheduled, not instant

**What you'll see:** After setting or lowering a database's retention period, expired data immediately disappears from query results — but disk usage does not drop right away. Old Parquet files linger.

**Why:** Lowering retention filters query results immediately, but physical deletion of expired Parquet happens on a periodic sweep tied to compaction, not the instant the window passes.

**What to do:** Expect a delay between "data aged out" and "disk reclaimed." Don't hand-delete files to speed it up (see #5). Details in `references/storage-and-compaction.md`.

---

## 4. The `memory` object store is volatile

**What you'll see:** A server started with `--object-store=memory` loses all data on restart.

**Why:** `--object-store=memory` holds all data in RAM. It is a testing/dev convenience, not durable storage.

**What to do:** Never use `memory` for sustained or production writes. Use `file`, `s3`, `google`, or `azure`. Object-store options in `references/configuration.md`.

---

## 5. Never hand-delete WAL or Parquet files to reclaim disk

**What you'll see:** Disk is filling up, and the WAL/Parquet directories are the obvious culprit. Deleting them "frees space."

**Why:** Those files are the database's durability and data. Deleting them causes data loss or catalog/Parquet corruption — there is no safe manual cleanup of the data dir.

**What to do:** Reclaim space through retention and compaction, not `rm`. If disk is critically low, follow the recovery steps in `references/memory-and-resources.md`.

---

## 6. The query memory pool defaults to a PERCENTAGE of host RAM

**What you'll see:** The same `serve` config behaves differently on differently-sized hosts — a query that runs fine on a big box gets `ResourcesExhausted` on a smaller one, with no config change.

**Why:** `--exec-mem-pool-bytes` defaults to `20%` of total host memory (Enterprise), not an absolute byte value. Several related buffers are also percentage-based (e.g. `--force-snapshot-mem-threshold` defaults to `50%`, `--parquet-mem-cache-size` to `20%`).

**What to do:** Set an explicit value (`--exec-mem-pool-bytes <bytes>` or a percentage) when you need predictable behavior across hosts. Sizing guidance in `references/configuration.md`.

---

## 7. Some perf-tuning doc flags don't exist in the 3.10 build

**What you'll see:** Following older performance-tuning docs, you pass `--num-io-threads` or `--checkpoint-interval` to `influxdb3 serve` and the server fails to start with `error: unexpected argument`.

**Why:** Doc-vs-build drift. Those flags are not present in the 3.10 `serve --help-all` output (verified: 0 matches). The docs describe flags from a different build or that were renamed/removed.

**What to do:** Treat `influxdb3 serve --help-all` as the source of truth for available flags, not the perf-tuning prose. Verified flags and their defaults are in `references/configuration.md`.

---

For non-ops quirks (client, app, and admin-CLI behaviors), see the shared catalogue: `skills/influxdb3/references/quirks.md`.
