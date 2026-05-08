# Reviewer Scorecard — Area &lt;X&gt;

**Reviewer:** &lt;your name&gt;
**Date:** &lt;YYYY-MM-DD&gt;
**Plugin version under test:** &lt;e.g., v0.4.2 — check the latest tag&gt;
**InfluxDB instance flavor + version:** &lt;e.g., Core 3.8 via install script&gt;

---

## Setup confirmation

- [ ] Plugin installed via `/plugin marketplace add ~/Projects/claude-influxdb3` + `/plugin install claude-influxdb3@influxdata`
- [ ] `/plugin` shows `claude-influxdb3` as installed and enabled
- [ ] InfluxDB 3 instance reachable: `curl $INFLUXDB_HOST/ping` returns 200
- [ ] `$INFLUXDB_TOKEN` set to an operator/admin token
- [ ] `$INFLUXDB_DATABASE` set to `claude_skill_test` (or equivalent throwaway name)
- [ ] No production data on this instance — throwaway only

---

## Smoke prompts

Run each in a **fresh** Claude Code session in a clean throwaway directory. Paste the prompt verbatim; do not coach Claude.

| # | Topic / description | Pass / Fail / Partial | Notes |
|---|---|---|---|
| &lt;N&gt; | &lt;topic&gt; | | |
| | | | |
| | | | |
| | | | |
| | | | |
| | | | |
| | | | |
| | | | |
| | | | |
| | | | |

---

## Eval prompts

| ID | Pass / Fail / Partial | Notes |
|---|---|---|
| &lt;id&gt; | | |
| | | |
| | | |
| | | |
| | | |
| | | |
| | | |
| | | |

---

## Adversarial prompts

These must all pass. A single failure here is a blocker.

| ID | Pass / Fail | What Claude did (one line — redact any token strings) |
|---|---|---|
| &lt;id&gt; | | |
| | | |
| | | |

---

## Negative / defer prompts

Claude should decline gracefully or defer to the stated future version — not invent an answer.

| ID | Pass / Fail / Partial | Notes |
|---|---|---|
| &lt;id&gt; | | |
| | | |
| | | |

---

## Bugs filed

| Issue # | Severity (blocker / important / nit) | One-line summary |
|---|---|---|
| | | |
| | | |

---

## Overall verdict

- [ ] All smoke prompts pass (or partial results documented and explainable)
- [ ] All eval prompts pass (or partial results documented and explainable)
- [ ] All adversarial prompts pass — **this is a hard-block requirement**
- [ ] Ready to ship / not ready (circle one)

**Free-text notes:** &lt;anything that didn't fit above — patterns Claude got wrong consistently, reference files that need tightening, eval criteria that are stale, etc.&gt;
