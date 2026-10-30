# Processing Engine documentation evidence

Reviewed 2026-10-28 for InfluxDB 3 Enterprise 3.12.0. These claims are documentation-grounded, not live-verified in this workspace. The external docs-tooling claims ledger is unavailable here; this file records the sources and affected skill files for this update.

Sources:

- [docs-v2 #7952](https://github.com/influxdata/docs-v2/pull/7952), merged as `8c2a6f492f48b720e03e7c38c922882faee186cb`. Includes the standalone process-node admin guide and Enterprise 3.12.0 known issues.
- [docs-v2 #7956](https://github.com/influxdata/docs-v2/pull/7956), open when reviewed, head `77ab70ecd220b15987fc664ab637a9c1777906b7`. Includes clarified configuration, placement, migration, and recovery guidance. Publication and live behavior have not been independently verified.

| Claim | Edition/version | Evidence state and source | Skill references |
|---|---|---|---|
| Standalone process node is recommended; plugin-dir enables process mode; explicit process mode requires a plugin directory; Docker inherits the directory variable | Enterprise 3.12.0 | Documented, #7952; clarified by open #7956 | `influxdb3-plugins/SKILL.md`, `references/enterprise-process-node.md` |
| WAL plugins on standalone process nodes follow all ingest nodes through object storage, beginning at current positions; cross-node standalone WAL processing begins in 3.12.0 | Enterprise 3.12.0, contrast with pre-3.12 | Documented, #7952 and open #7956 | `references/enterprise-process-node.md`, `references/troubleshooting.md` |
| Pin triggers with nodes:ID; all independently schedules on every process node; placement is immutable | Enterprise 3.12.0 | Documented, #7952; clarified by open #7956 | `references/enterprise-process-node.md` |
| Trigger creation, uploads, requests, and package installs target the process node; data/log queries target query nodes; writes target ingest nodes; packages are node-local | Enterprise 3.12.0 | Documented, #7952 admin guide | `references/enterprise-process-node.md`, `references/dependencies.md`, `references/triggers-cli.md` |
| Plugin queries, writes, and log persistence need reachable query/ingest internode listeners; standalone process node needs no listener | Enterprise 3.12.0 | Documented, #7952 admin guide | `references/enterprise-process-node.md` |
| Python tracebacks and deferred-write failures can appear only in server logs; synchronous writes expose failures to plugins | Enterprise 3.12.0 | Documented, #7952 admin guide and #7956 notes | `SKILL.md`, `references/enterprise-process-node.md`, `references/testing.md`, `references/troubleshooting.md` |
| Migration records settings, disables triggers, moves files/dependencies, removes old process configuration, recreates triggers, reroutes requests, verifies before resuming paused writes | Enterprise 3.12.0 | Documented in open #7956, migration section | `references/enterprise-process-node.md` |
| Scheduler state persists separately from plugin cache; WAL recovery requires retained files; schedule calls/retries survive; requests do not replay; repeated runs require idempotent effects; corrupt-state removal loses saved work | Enterprise 3.12.0 | Documented, #7952; WAL qualification and backup procedure in open #7956 | `references/enterprise-process-node.md` |
| Known issues cover WAL expiry/stalls and watermark diagnosis, empty plugin listings, missing node-spec metadata, Utf8View conversion, help-all options, and Docker Desktop exit 133; request queues hold 60 pending calls | Enterprise 3.12.0 | Documented, #7952 release notes and admin guide | `references/enterprise-process-node.md`, `references/installing.md`, `references/troubleshooting.md` |
| Embedded virtual environment is .venv; configuration template incorrectly says venv | Enterprise 3.12.0 | Documented, #7952 release notes and admin guide | `SKILL.md`, `references/dependencies.md`, `references/troubleshooting.md`, sibling `influxdb3/references/quirks.md` |

Skill reference paths above are relative to `skills/influxdb3-plugins/` unless marked as the sibling skill.
