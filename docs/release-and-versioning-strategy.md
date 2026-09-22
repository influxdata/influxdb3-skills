# Release and versioning strategy

> [!CAUTION]
> Keep this plan in the forever-private `_dev` repository.
> Do not copy it to the public `claude-skill-for-influxdb3` repository.

Maintain two independent records:

| Record | Purpose | Required contents |
| --- | --- | --- |
| Plugin release version | Identifies a distributable skill package. | One centrally defined semantic version propagated to each provider manifest and generated bundle. |
| Capability evidence matrix | Establishes whether a product claim is safe to teach. | Claim, task, product or edition, exact version or revision, source URL or artifact, evidence state, owning skill or reference, and evaluation case. |

A plugin patch version doesn't imply a database-version support range.
A release can update one reference or edition without revalidating every product surface.
Do not express broad support as a range such as `>=3.8` when material behavior changed within it.
Record the exact last-verified edition and version.
Annotate references at the version where behavior changed.

## Planned release sequence

Version the plugin as one package.
Do not assign independent versions to bundled skills.
Use `0.1.0` as the private baseline if the plugin has no existing version.

| Milestone | Estimated version | Availability |
| --- | --- | --- |
| Evidence baseline | No release | Private development only. |
| Universal application and Cloud routing | `0.2.0` | Private development only. |
| Operations skill | `0.3.0` | Private development only. |
| Telegraf skill | `0.4.0` | Private development only. |
| Processing Engine refresh | `0.5.0` | Private development only. |
| Repeatable evaluation and distribution | `0.6.0` | Private development only. |
| Universal rename and packaging changes | Next available `0.x.0` | Private development only. The separate rename plan defines the exact version and timing. |
| Complete-plugin beta | `1.0.0-beta.1` | First public release. |
| Stable launch | `1.0.0` | Public release. |

Complete the universal rename before the beta.
The rename doesn't require a major version because no earlier version is public.
Use patch releases for corrections that don't change skill boundaries or expected behavior.
Use minor releases for backward-compatible capabilities after `1.0.0`.

## Beta and stable launch

Publish one short beta for the complete plugin.
Do not publish separate betas for individual skills.
Publish `1.0.0-beta.2` only when `1.0.0-beta.1` needs material corrections.

Publish `1.0.0` when:

- Installation works on every target agent.
- Routing evaluations pass with each skill installed alone and with related skills.
- Each product claim has edition and version evidence.
- No unresolved credential-handling or destructive-operation failures remain.
- Release rollback and user feedback paths work.

After `1.0.0`, publish corrections as patch releases and new backward-compatible capabilities as minor releases.

Use these provenance labels where useful:

- **Official:** An authoritative InfluxData source documents the claim.
- **Live-verified:** The claim is official and tested against a named product and exact version.
- **Derived:** Official behavior supports a cautious conclusion. Explain the reasoning, and don't present it as an API guarantee.
- **Unknown:** Available evidence doesn't establish the claim. Route to current documentation or request context.

Before publishing a release:

1. Verify that source skills, generated packages, and manifests are in sync.
2. Verify that each changed product claim has an official source and edition or version context in the evidence matrix.
3. Run affected boundary and safety evaluations against named editions and versions when live evaluation is available.
4. Publish exact live-evaluated and documentation-only coverage. Do not treat missing live evaluation as unsupported.
5. Separate packaging changes, documentation-grounded capability changes, and live-verified behavior changes in the release notes.

Run scheduled documentation and release-note triage.
Require human review before publishing changed product behavior.
