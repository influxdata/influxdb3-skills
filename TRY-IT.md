# Try the InfluxDB 3 Claude Code skill — 10-minute test drive

We built a Claude Code plugin that teaches Claude to write **correct** InfluxDB 3 code — connections, writes, queries, schema design, database & token admin, Processing Engine plugins, and troubleshooting. Before we share it more widely, we'd love you to kick the tires.

**You don't need to be an InfluxDB expert.** Testing it as a non-expert is exactly the signal we want — if Claude leads a newcomer astray, that's a bug we need to know about.

---

## 1. What you need

- **Claude Code** installed (a recent version).
- **GitHub access to the InfluxData org.** The repo is internal, so Claude Code installs it using your existing GitHub credentials. If you've run `gh auth login` (or push/pull from InfluxData repos in your terminal already), you're set. If not, run `gh auth login` once first — otherwise step 2 will fail with a 401/403.
- **~10 minutes.**
- *(Optional)* a local InfluxDB 3 instance — only needed if you want to actually **run** the code Claude generates. Plenty of useful testing needs no database at all (see Tier 1).

## 2. Install (~1 minute)

Pick the path that matches you.

### Option A — From GitHub (if you have InfluxData GitHub access)

In Claude Code, run:

```text
/plugin marketplace add influxdata/claude-skill-for-influxdb3
```

```text
/plugin install claude-influxdb3@influxdata
```

Verify with `/plugin` — you should see **`claude-influxdb3`** listed as installed and enabled. If it doesn't show up right away, run `/reload-plugins`. No full restart needed.

**Hit an auth error on the first command?** That means GitHub credentials aren't cached. Run `gh auth login` (choose GitHub.com → HTTPS), then retry.

### Option B — From a file (no GitHub account needed)

If you don't have GitHub access, ask your contact for the **`claude-skill-for-influxdb3.zip`** file (it'll come over Slack).

1. **Unzip it to a stable location** — e.g. `~/Downloads/claude-skill-for-influxdb3`. Pick somewhere permanent, *not* a temp folder: Claude Code references the plugin by this path, so if you move or delete it later, the plugin stops working.
2. In Claude Code, run (substitute your actual unzip path):

   ```text
   /plugin marketplace add ~/Downloads/claude-skill-for-influxdb3
   ```

   ```text
   /plugin install claude-influxdb3@influxdata
   ```

3. Verify with `/plugin`; run `/reload-plugins` if it doesn't appear immediately.

> The unzipped folder contains a hidden `.git` directory — that's intentional, please leave it in place (it's what lets Claude Code resolve the plugin). You do **not** need git installed or any GitHub account for this to work.

## 3. Test it — pick a tier

### Tier 1 — No database needed (~3 min)

Open a **fresh** Claude Code session (so the skill loads cleanly) in any throwaway folder, and paste any of these. Judge whether the answer looks correct and genuinely useful:

- *"I'm using InfluxDB 3. Help me design a schema for tracking temperature across 10,000 sensors."*
- *"Write a Python script that queries the last hour of data from InfluxDB 3."*
- *"I'm getting a 401 from InfluxDB 3 — walk me through diagnosing it."*
- *"What's the difference between InfluxDB 3 Core and Enterprise for my client code?"*
- *"Write an InfluxDB 3 Processing Engine plugin that logs the row count whenever data hits my `sensors` table."*

### Tier 2 — With a local instance (~7 min, includes setup)

Want to actually run what Claude writes? Just ask:

> *"I don't have InfluxDB 3 yet — help me get a Core instance running."*

Claude will walk you through a ~3-minute local install. Then try:

> *"Write and run a Python script that connects to my InfluxDB 3 Core, creates a database, and writes 10 sample points."*

## 4. What we're looking for

- ✅ Did Claude give **correct, runnable** guidance?
- ✅ Did it **ask the right setup questions first** instead of just dumping code?
- ✅ Did anything feel **wrong, outdated, or confusing**?
- ✅ Bonus — did it **refuse unsafe things** (e.g., hard-coding a token, inventing a `time_bucket()` function that doesn't exist in v3)?

A 👍 "this just worked" is as useful to us as a 👎 — both are data.

## 5. How to report (30 seconds)

- **File a quick issue:** https://github.com/influxdata/claude-skill-for-influxdb3/issues/new
- **Or drop a note in** `#project-influxdb3-claude-skill`

Please include:
1. The **prompt** you used (copy-paste it).
2. What you **expected**.
3. What Claude **actually did** (paste the relevant part of the transcript — redact any real tokens).
4. A 👍 or 👎.

## 6. Want to go deeper?

There's a full reviewer guide with four focus areas and scorecards in [`TESTING.md`](TESTING.md). And the [`README.md`](README.md) has the complete feature list. But for a quick test drive, this page is all you need.

Thanks for helping — every prompt you try makes the skill better for the next person.
