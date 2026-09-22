title: InfluxDB 3 AI agent skills architecture and guiding principles

---

# Architecture and guiding principles

> [!CAUTION]
> Keep this plan in the forever-private `_dev` repository.
> Do not copy it to the public `claude-skill-for-influxdb3` repository.
> Renaming and generalizing the public repository belongs to a separate plan.

Create a small, trustworthy plugin that covers application, operations, extension, and data-collection workflows.
Ground product-specific behavior in authoritative documentation, verified test results, and live testing.
Do not claim support without evidence.

Keep the source portable and agent-neutral so that the plugin can support multiple agent platforms.

## Evidence model

Use these evidence states in skill content and evaluations:

| State | Meaning |
| --- | --- |
| Documented | Official documentation supports the claim for the named edition and version. |
| Live-verified | The claim is also tested against a named edition and exact version. |
| Not evaluated | The skill has no test evidence. This state doesn't mean unsupported. |
| Unknown | Documentation and tests don't establish the answer. Route to current documentation or request the missing context. |

Do not infer that a feature is unavailable because the skill hasn't evaluated it.
Fetch the relevant authoritative documentation for version-sensitive or edition-specific questions.

## Skill architecture

Ship one plugin with four skills:

| Skill | Owns | Boundary |
| --- | --- | --- |
| `influxdb3` | External application workflows. | Excludes service operations and in-process extensions. |
| `influxdb3-operations` | Deployment and service operations. | Excludes external application and in-process extension implementation. |
| `influxdb3-plugins` | In-process extension workflows. | Excludes general service administration. |
| `telegraf` | Data collection and forwarding workflows. | Excludes detailed centralized administration and licensing. |

Keep the external application and in-process extension seam explicit.
Cross-link when a task crosses it.
Do not duplicate runtime guidance.

## Skill structure

Keep each `SKILL.md` as a router with:

- Accurate triggers and exclusions.
- A concise task-selection workflow.
- Safety rules that apply to every task.
- Direct links to one-level-deep references.
- A lookup order for unknown or version-sensitive questions.

Put contract details, examples, upgrade paths, detailed behavior, and version-specific facts in task-shaped references.
Give each long reference a short table of contents and a "Read this when" cue in its parent skill.
Add new release behavior to the relevant reference instead of creating release-note references.

## Source and evidence policy

Before adding or changing a product claim:

1. Identify the edition, version, task, and claim.
2. Find the authoritative product documentation.
3. Record the claim, edition, version, source, evidence state, owning skill or reference, and evaluation case in the capability evidence matrix.
4. Add content only when it helps the model decide or avoid a surprising error.
5. Add or update evaluations for material behavior and boundaries.

Use release notes to discover changes, not as the sole source for stable procedures.
File documentation defects separately from skill changes.

Use documentation and live-system tools for distinct purposes:

1. Use authoritative documentation for product behavior, supported configuration, and version-specific facts.
2. Use live-system tools for instance state and direct observations.
3. Do not require connected tools. Fall back to curated authoritative links or request the missing context.

For conflicts, documentation for the exact product and version is authoritative.
Treat a live observation as evidence only after identifying the instance's edition and version.

## Safety and evaluation

- Never expose, repeat, or partially redact user-provided tokens. Use environment variables and safe placeholders.
- Use least-privilege application credentials. Do not put administrator credentials in application code.
- Require confirmation before destructive, irreversible, or disruptive operations.
- Do not create substitute data silently or claim a successful live operation without evidence.
- Look up version-sensitive configuration values, endpoints, and commands. Do not guess.
- Keep product and edition claims within documented scope.

Test routing boundaries and decisions, not only answer recall.
Cover each skill's owned workflows, documentation routing, tool-present and tool-absent behavior, destructive-action confirmation, and credential safety.
Run each skill alone and with related skills to detect routing collisions.
Record failed authentication as unknown, not passing.
