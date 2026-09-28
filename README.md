# influxdb3-skills

Agent skills that help AI coding agents write correct InfluxDB 3 code, manage databases and tokens, build Processing Engine plugins, and troubleshoot problems in InfluxDB 3 Core and InfluxDB 3 Enterprise.

## Install

The skills follow the [Agent Skills specification](https://agentskills.io/specification),
so any agent that supports the format can load them.

### Claude Code

```text
/plugin marketplace add influxdata/influxdb3_skills
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
codex plugin marketplace add influxdata/influxdb3_skills
codex plugin add influxdb3-skills@influxdata-influxdb3
```

Start a new thread so Codex loads the skills.

### Other agents

The root `plugin.json` follows the [Agent Plugins](https://agent-plugins.org) format,
so clients that support Agent Plugins can install the repository as a plugin.

To install the skills into any agent that reads Agent Skills,
use the [`skills` CLI](https://github.com/vercel-labs/skills):

```sh
npx skills add influxdata/influxdb3_skills
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
It only asks for an OAuth login, which it uses for rate limiting.
To connect your agent to it, see [the MCP server setup page](https://docs.influxdata.com/platform/mcp/server/).

Generated code covers Python, JavaScript and TypeScript, Go, Java, C#, and raw HTTP.

### `influxdb3`: application and admin work

- **Get InfluxDB 3 running:** installs InfluxDB 3 Core and InfluxDB 3 Enterprise with the official script or Docker, creates the operator token, and checks the server with `/ping`.
  This helps if you don't have a server yet.
- **Connect and authenticate:** reads the host, token, and database from environment variables, never inlines a token, and checks that `.gitignore` covers `.env`.
- **Detect Core or Enterprise:** probes `/ping` and reads the `x-influxdb-build` and `x-influxdb-version` response headers.
  If the result is ambiguous, the agent asks you.
- **Write data:** line protocol, batching, retriable and non-retriable errors, and which write endpoints accept partial writes.
- **Query data:** InfluxDB 3 SQL by default, parameterized user input, pagination, and time-bucket queries.
- **Design schemas:** tags or fields, naming conventions, and stable column types.
- **Provision databases:** create, list, update the retention period, and delete, with the CLI or the HTTP API.
- **Manage tokens:** admin tokens and scoped resource tokens (`db:<name>:read,write`), listing with `system.tokens`, and safe rotation.
  Rotation creates the new token, swaps the secret, and then revokes the old token, never in another order.
- **Automate admin work:** complete lifecycle examples in Python, JavaScript and TypeScript, Go, Java, C#, and raw HTTP.
- **Troubleshoot:** a symptom-keyed guide for auth failures, writes misrouted by silent database auto-creation, write and query failures, admin failures, and plugin runtime issues.
  If you paste a token, the agent doesn't repeat any part of it.
- **Run a diagnostic:** a Python script that produces a one-page health report.
  It checks `/ping`, detects the product, lists databases, and writes and queries a throwaway database.
  Run it when something seems wrong, before you paste an error into your agent.
- **Fix common mistakes:** five broken-and-fixed example pairs for silent auto-creation, an admin token used on the data plane, `table_batches` attribute access, `system.tokens.permissions` parsing, and `HEAD` requests to `/ping`.

### `influxdb3-plugins`: Processing Engine plugins

- **Develop plugins:** the `influxdb3_local` runtime API, `LineBuilder`, the cache, and the three entry points (`process_writes`, `process_scheduled_call`, and `process_request`).
  `table_batches` items are dicts, not class instances.
- **Install plugins:** `--upload`, `PUT /api/v3/plugins/files`, and the `gh:` prefix for the official plugin repo.
- **Test plugins:** `influxdb3 test wal_plugin` and `influxdb3 test schedule_plugin` for offline runs, and a live loop with `influxdb3 update trigger` and `system.processing_engine_logs`.
- **Manage plugin dependencies:** `influxdb3 install package` installs into the server's embedded virtual environment.
  The skill doesn't suggest `python -m venv` against the system Python.
- **Keep state across runs:** trigger-local and global cache namespaces with TTLs.
- **Diagnose plugin problems:** triggers that don't fire, dependency `ImportError`s, `table_batches` mistakes, and cache lifecycle issues.

Both skills cover all three trigger types on single-node deployments.

## What the skills don't cover

For these topics, the skills point to the official docs instead of guessing:

- **Performance tuning:** slow queries, slow writes, cardinality remediation, and workload-specific batch-size tuning.
- **Migration from InfluxDB v1 or v2 to InfluxDB 3.**
- **App-pattern templates:** IoT pipelines, dashboards, alerts, and downsampling.
- **Multi-node plugin deployments:** cluster placement and multi-node patterns.
- **Air-gapped setup:** offline mirrors, custom plugin repos, and offline package installs.
- **Product-specific admin for InfluxDB Cloud Serverless, InfluxDB Cloud Dedicated, and InfluxDB Clustered:**
  these products use different APIs to manage tokens and databases.
- **InfluxDB Cloud (TSM), InfluxDB Cloud 1, InfluxDB OSS v1, and InfluxDB OSS v2.**

## Check the tested versions

Each `SKILL.md` records under `metadata:` the date and InfluxDB 3 versions its docs were checked against,
and the date and versions it was last live-verified against.
The `influxdb3` skill also records the client library versions.
If those look stale, the skill might be drifting from the product. Open an issue in this repository.

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
git clone https://github.com/influxdata/influxdb3_skills.git ~/Projects/influxdb3-skills
```

In Claude Code, remove the published marketplace first, because both use the name `influxdata-influxdb3`:

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
