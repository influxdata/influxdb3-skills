title: InfluxDB 3 AI agent skills incremental plan
# Incremental plan

> [!CAUTION]
> Keep this plan in the forever-private `_dev` repository.
> Do not copy it to the public `claude-skill-for-influxdb3` repository.
> Renaming and generalizing the public repository belongs to a separate plan.

The current plugin already has substantial safety guidance, examples, and criteria-based evaluations.
Preserve those strengths while making these changes.

The version estimates apply to the complete plugin, not to individual skills.
The [release and versioning strategy](release-and-versioning-strategy.md) defines the beta and stable-launch gates.

## Increment 0: Establish the evidence baseline (no release)

Create the capability evidence matrix for InfluxDB 3.11.5 and current Cloud and Telegraf documentation.
Resolve source conflicts and record documentation defects.
Use the InfluxData documentation MCP server or official documentation for product behavior, supported configuration, and version-specific facts.
For live instance state, such as schema, tokens, query results, and observations, use the following:

- the `influxdb3` CLI
- the InfluxDB 3 MCP server

Do not require either MCP server.
Fall back to curated official links or request the missing edition and version.
Do not change skill behavior.

## Increment 1: Fix universal application and Cloud routing (`0.2.0`)

Start from the existing two-skill plugin.
Reshape `influxdb3` as an application-use router.
Cover application writes, queries, schemas, SQL or InfluxQL selection, and common data-path diagnosis.
Exclude server lifecycle, upgrades, cluster operations, and Processing Engine implementation.
Align plugin metadata, the README, skill frontmatter, and evaluation claims.
Treat InfluxDB 3 Cloud as a supported limited-availability edition.
Before stating that Cloud supports a capability, endpoint, limitation, or workflow, verify the current Cloud documentation.
Replace unsupported or deferred Cloud wording with documentation-grounded routing and verified coverage.
Do not make unverified Cloud operations claims in `influxdb3-operations`.
Route Cloud operations to current documentation.
Add edition and version lookup rules.
Route OpenAPI, official client library, and Explorer questions to their authoritative sources.
Keep operational release changes out of this skill.
Add evaluations for Cloud documentation routing and documented scope.
Add evaluations for write, query, schema, and query-language routing.

Use these source boundaries:

| Surface | Use it for | Don't use it for |
| --- | --- | --- |
| OpenAPI specifications | Verify request and response contracts for a named API, edition, and revision. Locate generated client or reference changes. | Infer availability across editions or a supported workflow without product documentation. |
| Official InfluxDB 3 client libraries | Generate language-specific connection, write, and query code. Check the selected software development kit (SDK) version's API and options. | Generalize one SDK's behavior across languages or editions. |
| InfluxDB 3 Explorer | Route visualization, query-building, and Explorer questions to product documentation. For Enterprise, verify the WebAssembly-integrated UI configuration and version behavior. | Assume availability, UI behavior, or deployment details in another edition. |

Name these surfaces in the `influxdb3` source-routing policy.
Do not embed their full reference material in `SKILL.md`.
Do not add a client SDK skill until real prompts show that language-specific release cadence and validation need an independent boundary.
Add a focused Explorer skill only when real prompts establish a distinct recurring workflow that documentation routing cannot handle.

Use this initial layout:

```text
skills/influxdb3/
  SKILL.md
  references/
    edition-and-version.md
    sources.md
    query-and-write.md
    write-contract.md
    schema-design.md
    troubleshooting.md
```

## Increment 2: Add the operations skill (`0.3.0`)

Add `influxdb3-operations` for Core and Enterprise.
Start with upgrade paths, catalog and PachaTree changes, InfluxDB 3.11 `serve` configuration compatibility, authentication and role-based access control, backup, and restore.
Do not make unverified edition-specific operations claims.
Route operations outside verified scope to current documentation.
Require confirmation for catalog migration, storage cleanup, and other irreversible actions.
Add evaluations for installation, upgrades, backup, restore, storage, configuration, and destructive-action confirmation.

Use this initial layout:

```text
skills/influxdb3-operations/
  SKILL.md
  references/
    sources.md
    upgrade-paths.md
    pachatree.md
    serve-config-compatibility.md
    auth-and-rbac.md
    backup-restore.md
```

## Increment 3: Add the Telegraf skill (`0.4.0`)

Treat Telegraf as a first-class related product.
Add `telegraf` for agent configuration, inputs, processors, aggregators, outputs, troubleshooting, and edition-specific InfluxDB 3 destinations.
Explain that Telegraf Controller manages agent configurations and fleet health.
Explain that Telegraf Enterprise packages Telegraf and Telegraf Controller for supported scale, high availability, audit logging, and enterprise authentication.
Route detailed Controller, licensing, and enterprise deployment work to current documentation.
Add evaluations for Telegraf configuration and InfluxDB 3 output routing.

## Increment 4: Refresh the Processing Engine skill (`0.5.0`)

Preserve the existing external-application versus Processing Engine boundary.
Keep `influxdb3-plugins` focused on Processing Engine plugin creation, installation, testing, runtime APIs, embedded dependencies, triggers, and troubleshooting.
Exclude general administration, and link to operations prerequisites.
Update the skill for current trigger concurrency, retries, persistence, package management, and cross-database behavior.
Keep its evaluation surface independent.
Add evaluations for triggers, runtime APIs, packages, and plugin debugging.

## Increment 5: Automate evaluation and distribution (`0.6.0`)

Automate stable evaluation cases with the existing testbench.
Do not block earlier content releases on a new runner.
When the plugin supports multiple agents, use one source manifest to generate provider packages.
Validate generated output in continuous integration.

Each release names the exact editions and versions evaluated.
The architecture remains one plugin with four skills: `influxdb3`, `influxdb3-operations`, `influxdb3-plugins`, and `telegraf`.
