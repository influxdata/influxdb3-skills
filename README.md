# influxdb3-skills

Agent skills that help AI coding agents write correct InfluxDB 3 code, manage databases and tokens, build Processing Engine plugins, and troubleshoot problems in InfluxDB 3 Core, InfluxDB 3 Enterprise, and InfluxDB 3 Cloud.

## Install

The skills follow the [Agent Skills specification](https://agentskills.io/specification),
so any agent that supports the format can load them.

### Claude Code

```text
/plugin marketplace add influxdata/influxdb3-skills
/plugin install influxdb3-skills@influxdata-influxdb3
```

Claude Code namespaces plugin skills,
so the skills load as `influxdb3-skills:influxdb3` and `influxdb3-skills:influxdb3-plugins`.
If they don't appear right away, run `/reload-plugins`.

To update the plugin:

```text
/plugin marketplace update influxdata-influxdb3
/plugin update influxdb3-skills@influxdata-influxdb3
```

### Codex

```sh
codex plugin marketplace add influxdata/influxdb3-skills
codex plugin add influxdb3-skills@influxdata-influxdb3
```

Start a new thread so Codex loads the skills.

### Other agents

The root `plugin.json` follows the [Agent Plugins](https://agent-plugins.org) format,
so clients that support Agent Plugins can install the repository as a plugin.

To install the skills into any agent that reads Agent Skills,
use the [`skills` CLI](https://github.com/vercel-labs/skills):

```sh
npx skills add influxdata/influxdb3-skills
```

You can also copy the directories under `skills/` to the location where your agent reads skills.

If you don't have InfluxDB 3 running yet, ask your agent.
The skill walks you through the install.

## Try it

In a project that uses InfluxDB 3, write code as usual.
The `influxdb3` skill loads when your agent sees any of the following:

- an import of an official InfluxDB 3 client
- line protocol
- `INFLUXDB_*` environment variables, such as `INFLUXDB_HOST` and `INFLUXDB_TOKEN`
- admin commands and endpoints, such as `influxdb3 create token` or `/api/v3/configure/database`
- troubleshooting questions, such as "I'm getting a 401" or "writes succeed but the data isn't there"

To try it, start a new session and paste a prompt.
These prompts don't need a database:

- "I'm using InfluxDB 3. Help me design a schema for tracking temperature across 10,000 sensors."
- "Write a Python script that queries the last hour of data from InfluxDB 3."
- "I'm getting a 401 from InfluxDB 3. Walk me through diagnosing it."
- "What's the difference between InfluxDB 3 Core and Enterprise for my client code?"
- "Write an InfluxDB 3 Processing Engine plugin that logs the row count whenever data hits my `sensors` table."

To run the generated code, set up a local instance first:

1. "I don't have InfluxDB 3 yet. Help me get a Core instance running."
2. "Write and run a Python script that connects to my InfluxDB 3 Core, creates a database, and writes 10 sample points."

## What the skills do

The plugin contains two skills, versioned together with the plugin.
Each skill loads automatically when its topics come up in a conversation with your agent.
The skills don't require an MCP server.
If the InfluxDB Documentation MCP server is connected, the skills use it to look up the docs.
The server is hosted, so you don't run it or need an API key.
It asks only for an OAuth login, which it uses for rate limiting.
To connect your agent to it, see [the MCP server setup page](https://docs.influxdata.com/platform/mcp/server/).

Generated code covers Python, JavaScript and TypeScript, Go, Java, C#, and raw HTTP.

### `influxdb3`: application and admin work

- **Get InfluxDB 3 running:** installs InfluxDB 3 Core and InfluxDB 3 Enterprise with the official script or Docker, creates the operator token, and checks the server with `/ping`.
  This helps if you don't have a server yet.
- **Connect and authenticate:** reads the host, token, and database from environment variables, never inlines a token, and checks that `.gitignore` covers `.env`.
- **Detect Core or Enterprise:** probes `/ping` and reads the `x-influxdb-build` and `x-influxdb-version` response headers.
  If the result is ambiguous, the agent asks you.
- **Identify other InfluxDB products:** reads the host name and the `/ping` version headers.
  A host that ends in `enterprise.influxdb.io` is InfluxDB 3 Cloud, not a self-hosted Enterprise server.
  If you say only "InfluxDB Cloud" and neither signal matches, the agent asks which product you mean.
  For a product the skill doesn't cover, the agent links to that product's docs instead of answering from memory.
- **Write data:** line protocol, batching, retriable and non-retriable errors, and which write endpoints accept partial writes.
- **Query data:** InfluxDB 3 SQL by default, InfluxQL when you ask for it, parameterized user input, pagination, and time-bucket queries.
- **Design schemas:** tags or fields, naming conventions, and stable column types.
- **Provision databases:** create, list, update the retention period, and delete, with the CLI or the HTTP API.
- **Manage tokens:** admin tokens and scoped resource tokens (`db:<name>:read,write`), listing with `system.tokens`, and safe rotation.
  Rotation creates the new token, swaps the secret, and then revokes the old token, never in another order.
- **Automate admin work:** complete lifecycle examples in Python and raw HTTP (`curl`).
- **Troubleshoot:** a symptom-keyed guide for auth failures, writes misrouted by silent database auto-creation, write and query failures, admin failures, and plugin runtime issues.
  If you paste a token, the agent doesn't repeat any part of it.
- **Run a diagnostic:** a Python script that produces a one-page health report.
  It checks `/ping`, detects the product, lists databases, and writes and queries a throwaway database.
  Run it when something seems wrong, before you paste an error into your agent.
- **Fix common mistakes:** four examples, each with broken code and its fix:
  - With the default settings, a write to a misspelled database name creates a new database.
    Queries against the intended database return no rows.
  - Application code writes with the admin token, which has full access to every database, instead of a token scoped to its database.
  - A script treats `system.tokens.permissions` as a list.
    The value is a string.
  - A health check sends `HEAD /ping` and gets a 404, because `/ping` accepts only `GET`.

### `influxdb3-plugins`: Processing Engine plugins

- **Develop plugins:** the `influxdb3_local` runtime API, `LineBuilder`, the cache, and the three entry points (`process_writes`, `process_scheduled_call`, and `process_request`).
  `table_batches` items are dicts, not class instances.
- **Install plugins:** `--upload`, `POST /api/v3/plugins/files` with a JSON body, and the `gh:` prefix for the official plugin repo.
- **Test plugins:** `influxdb3 test wal_plugin` and `influxdb3 test schedule_plugin` for offline runs before you create the trigger, and a live loop with `influxdb3 update trigger` and `system.processing_engine_logs`.
- **Manage plugin dependencies:** `influxdb3 install package` installs into the server's embedded virtual environment.
  The skill doesn't suggest `python -m venv` against the system Python.
- **Keep state across runs:** trigger-local and global cache namespaces with TTLs.
- **Diagnose plugin problems:** triggers that don't fire, uncaught exceptions, dependency `ImportError`s, and cache lifecycle issues.
  A broken-and-fixed example pair shows `table_batches` attribute access.
- **Keep plugins safe:** plugin files stay inside `--plugin-dir`.
  A key passed as a trigger argument is readable through the system tables, so the agent recommends a key for that plugin alone.

Both skills cover all three trigger types on single-node deployments.

## What the skills don't cover

For these topics, the skills point to the official docs instead of guessing:

- **Performance tuning:** slow queries, slow writes, cardinality remediation, and workload-specific batch-size tuning.
- **Migration from InfluxDB v1 or v2 to InfluxDB 3.**
- **App-pattern templates:** IoT pipelines, dashboards, alerts, and downsampling.
- **Multi-node plugin deployments:** cluster placement and multi-node patterns.
- **Air-gapped setup:** offline mirrors, custom plugin repos, and offline package installs.
- **InfluxDB Cloud Serverless, InfluxDB Cloud Dedicated, and InfluxDB Clustered:**
  these products have no `/api/v3` endpoints and use different tokens and databases.
- **InfluxDB Cloud (TSM), InfluxDB Cloud 1, InfluxDB OSS v1, and InfluxDB OSS v2.**

Before 0.7.3, the `influxdb3` skill also covered InfluxDB Cloud Serverless, InfluxDB Cloud Dedicated, and InfluxDB Clustered.
That guidance was thin and partly wrong.
0.7.3 removed it, to make the skill shorter and its answers for the products it covers more reliable.
The skill still names those products in its description, so it loads for them.
It then identifies the product from the host name or the `/ping` version headers and links to that product's docs.

## Check the tested versions

Each `SKILL.md` records under `metadata:` the date and InfluxDB 3 versions its docs were checked against,
and the date it was last live-verified (`live_verified`).
The `influxdb3` skill also records the client library versions.
If those look stale, the skill might be drifting from the product.
Open an issue in this repository.

Release history is in [`CHANGELOG.md`](CHANGELOG.md).

## Contributing

1. Edit the relevant `SKILL.md`, `references/`, or `examples/` file.
   Follow the evidence rules in [`docs/publishing.md`](docs/publishing.md).
2. Use full product names, never "Cloud" alone, and keep skill text agent-neutral.
3. Run the checks in [`TESTING.md`](TESTING.md) for your change.
   Adversarial eval cases must pass 100%.
4. Open a pull request.

### Develop locally

To install your working copy instead of the published version, clone the repo:

```bash
git clone https://github.com/influxdata/influxdb3-skills.git ~/Projects/influxdb3-skills
```

The published marketplace and your local one both use the name `influxdata-influxdb3`.
In Claude Code, remove the published marketplace first:

```text
/plugin uninstall influxdb3-skills@influxdata-influxdb3
/plugin marketplace remove influxdata-influxdb3
/plugin marketplace add ~/Projects/influxdb3-skills
/plugin install influxdb3-skills@influxdata-influxdb3
```

Claude Code reads a local marketplace from the directory's working tree,
so it uses whatever branch is checked out.
To test a branch, check it out or add its worktree directory as the marketplace.
After you edit files, start a new session to load the changes.

## License

MIT. See [`LICENSE`](LICENSE).
