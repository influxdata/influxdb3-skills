# InfluxDB 3 skills compatibility

This context defines compatibility and release boundaries for the bundled InfluxDB 3 skills.

## Language

**Release seam**:
A boundary around a change that can merge to `main` as verified, production-worthy guidance.
Consumers can pull the resulting `main` directly and expect its guidance to be true.
_Avoid_: Unverified staging merge

**Compatibility baseline**:
A verified package state that corrects existing 3.12.1 guidance across `influxdb3` and `influxdb3-plugins` together.
It excludes additions to the skills' capabilities.

**Package release**:
An immutable, versioned distribution of the bundled skills with evidence for that exact state.
Every skill-changing merge to `main` receives a new shared package version.

**Compatibility correction**:
A change that keeps existing skill guidance accurate for the InfluxDB edition and exact version under review.
Compatibility corrections apply across both bundled skills.
_Avoid_: Feature adoption

**New capability**:
An addition to what the skills teach or support, considered separately from corrections to existing guidance.
_Avoid_: Required compatibility correction
