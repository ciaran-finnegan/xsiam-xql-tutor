# Changelog

All notable changes to XQL Tutor are recorded here. The format follows Keep a Changelog; versions follow semantic versioning.

## [1.0.0] - 2026-10-27

First public release.

- Sandbox interpreter for a large subset of XQL (26 stages parsed, 21 executed including `datamodel`, ~60 functions) with
  teaching-oriented error messages and a stage-by-stage trace.
- A fictional one-week tenant: endpoint telemetry, Windows event logs, firewall traffic, threat, URL and GlobalProtect
  logs, AWS CloudTrail and VPC flow logs, Azure activity and NSG flow logs, Entra ID sign-in and audit logs, GitHub EMU
  audit, Snowflake login history, alerts and three lookups, plus Cortex Data Model mappings.
- Seventeen units and 170 cards: worked examples, predict-the-output, spot-the-bug, Parsons problems, fill-the-blanks
  and write-the-query, graded by executing queries. Spaced repetition with interleaved review sessions.
- Optional passwordless sign-in (email one-time code or federated identity) and a handle-only leaderboard.
- Open-source governance: MIT licence, security policy, contribution guide, code of conduct, CI, CodeQL, strict CSP.
