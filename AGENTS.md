# Instructions for Codex — st-rpg-core

Read `SPEC.md` before making changes. Communicate with the user in Russian. Keep technical documentation precise; ask only for truly blocking decisions.

1. FIRST TASK IS RESEARCH, NOT IMPLEMENTATION. Inspect the current SillyTavern upstream source and official extension docs. Document verified API signatures, supported versions, hosted deployment constraints, and event lifecycle in `docs/feasibility.md`. Link to exact upstream code locations. Never invent APIs or assert undocumented event semantics.
2. Write a concise phased implementation plan with acceptance tests and known limitations. Do not implement all ten modules in one unreviewable patch.
3. Treat state as deterministic and authoritative; LLM output is untrusted proposed input. Never automatically apply uncertain narrative events. Use idempotent transitions, versioned persistence, migrations and testable RNG.
4. Distinguish world truth, player perception and per-NPC knowledge. Never leak secrets in prompts or UI.
5. Make all unspecified numerical rules configurable and mark them TODO; do not invent lore-critical defaults.
6. Protect against double application on regenerate, swipe, retries, chat switches and interrupted generations. Include tests for these cases.
7. Preserve independent operation from NPC Router. Expose a documented, optional versioned integration interface.
8. Before each substantial implementation phase, explain what will be changed and how to verify it. Run automated tests/lint where available, and report actual results rather than claiming unrun tests.
9. Avoid real bank transfers, unauthorized third-party account access, copyrighted playback or unverified geolocation. Device and bank features are in-world simulations.
10. Prefer clear modular source files, typed interfaces where practical, accessible responsive HUD, and user-editable Russian settings.
