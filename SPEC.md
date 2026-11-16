# RPG Core + HUD — Product specification

## Goal
Build a modular client-side SillyTavern extension providing a deterministic RPG world-state engine and attractive in-app HUD. The LLM narrates consequences but must never be the authoritative calculator of state. Support hosted SillyTavern access through the browser, without server filesystem access. Russian-language UI and narrative integration.

## Core principles
- Single canonical, versioned state per chat/campaign; persistent across refreshes and regenerations, with export/import, migrations, backup and rollback. Never leak state between chats.
- Deterministic rules engine for clocks, probabilities, resource consumption, checks, and derived effects. Seeded/testable RNG with logged rolls. Do not silently advance time on regenerate/swipe.
- Separate **world truth**, **what the player perceives**, and **what each NPC knows**. The HUD must not expose secret knowledge by default. The LLM receives only authorized context.
- Explicit state transitions with provenance and audit log; AI-generated prose is a *proposal* for changes, never an automatic unquestioned mutation. Validate events and allow user correction/undo.
- Configurable mechanics and discrete thresholds. Unknown numbers remain placeholders; do not invent probabilities, durations or thresholds.
- Prefer reliable client APIs documented or verified against the pinned SillyTavern version. No assumed event names or methods. Graceful fallback and clear errors.

## Modules

### 1. Cochlear implants and hearing
- Protagonist is profoundly deaf; bilateral cochlear implants provide mediated, non-natural hearing.
- Separate battery percentages for left/right processors, wearing/removal, charging, connection and operational states.
- Battery drains with in-world time; below configurable thresholds sound and speech recognition degrade. At zero, removed, or charging: no auditory access from that processor. Charging gradually replenishes to 100%.
- Five user-defined hearing quality levels (0–5, as specified by user; implement six discrete values 0,1,2,3,4,5), plus discrete interference values and trigger conditions.
- Noise, crowds, traffic, distance and other environmental factors reduce recognition; high-volume sounds may trigger overload, distortion and painful sensations. Do not equate ultrasound with objectively emitted sound without explicit world rules.
- Generated dialogue cannot be represented as intelligibly *heard* when unavailable; allow lipreading, text, sign, vibration and device notifications only when physically/visually justified. Degradation can redact fragments or mark unintelligibility without inventing unseen content.
- Hearing UI: battery, quality, interference, overload, Bluetooth link, device wearing state.

### 2. Reproductive physiology
- Configurable phase lengths, cycle progression and conception probabilities triggered only by relevant, explicitly established events; track for eligible protagonist and NPCs independently.
- Pregnancy trimesters with configurable durations; replace conception checks with trimester-specific miscarriage (T1/T2) or premature-birth (T3) risks.
- Stress modifies risk through a configurable, presently UNDEFINED rule. Do not invent medical certainty or hard-coded rates. Treat as fictional simulation, not medical guidance.
- Keep private NPC data out of player-facing HUD unless known in-world.

### 3. Devices and communications
- In-world iPhone and Apple Watch with accessibility accommodations: noise dB display, haptics, alerts, paired cochlear processors when worn/powered.
- Telegram, Signal, Instagram: fictional in-world messages, read/unread, notifications, timestamps, sender, threads. When Narration generates an incoming message, extract a structured event and render it as a phone notification; prevent duplicated narration and UI display. Prefer explicit structured output/event envelope over brittle free-text regex.
- Banking ledger with balances, transfers, incoming/outgoing transactions, validation; separate cryptocurrency wallet and currency units. No actual banking integrations or real transfers.
- Real-world track and playlist references as metadata only. Do not reproduce copyrighted audio/lyrics or assume streaming rights; external playback requires user-authorized service.

### 4. Inventory
- Items with quantities, durability/charges if applicable, owner, container, physical location and whether carried. Consumables decrement. Objects can be left behind, lost, transferred or recovered.
- Example items: cigarettes, passport, phone, keys. Do not auto-teleport forgotten items into inventory.

### 5. Skills and dice
- Skill proficiency 1–10. Discrete contextual difficulty (DC) and success/failure with configurable critical outcomes, consequences and modifiers.
- Injuries, fatigue, stress and other state may impose penalties. Show roll, modifiers, DC and outcome in audit/HUD. Rules configurable; exact mapping to be supplied later.
- Avoid rolling on arbitrary word matches alone: detect an actionable skill attempt and confirm deduplication by message/event ID.

### 6. Location and travel
- Real-world geography as a reference; current location, destination, mode, travel duration, nearby characters and place context. Never fabricate precise routing/travel times; offline approximations must be labeled.
- Location is distinct for each actor and inventory item. No instant travel unless established by time skip or world rules.

### 7. Health, injuries, stress
- Wounds/injuries with severity, healing progress, mobility limitations, mental effects, stress impact and dice penalties. Discrete configurable state transitions and HUD display.

### 8. Relationships and knowledge
- Directional relationships between all relevant characters, not just player-to-NPC: type (family, friend, colleague, stranger, lover, partner, uneasy ally, etc.), closeness, conflict/ignoring status, changes over time.
- NPC knowledge and personal-date awareness scoped per character. Relationships influence speech and choices through contextual data, not forced canned dialogue.
- Protagonist actions are controlled by user; engine does not invent her intentions.

### 9. Clock, calendar, schedules
- Canonical in-world date/time; advancing with actions, travel, sleep and time skips. Scheduled jobs, appointments, holidays, birthdays, engagement/wedding anniversaries, death anniversaries and other public/private dates.
- Timers count **game time**, not browser wall-clock unless explicitly configured. Do not double-count on retries or regeneration.

### 10. Plot arcs and microevents
- Persistent active/paused/completed story arcs, optional checklist and progress bar; arcs without checklist remain active and influence context.
- Timed microevents (deliveries, appointments, callbacks) with game-time countdown and triggers. Avoid spawning new plot arcs merely to fill silence.

## HUD
- In-SillyTavern collapsible responsive panel with compact summary and tabs: Status/Hearing, Devices, Inventory, Skills, Health, Relationships, Calendar, Quests, Event Log, Settings.
- Clear visual indicators, readable Russian labels, keyboard navigation and accessible contrast. Show only player-known information by default. Support manual correction, inspectable rolls and transaction history.
- HUD should not obscure chat on mobile or desktop; provide dock/float options if supported.

## LLM integration
- Inject a compact, structured, scoped snapshot into a supported prompt-injection mechanism after verifying the actual API. No huge repeated lore dumps.
- Separate hard constraints (e.g., no audible speech without operational hearing) from narrative hints. Recheck model output against key perception constraints where feasible; do not silently rewrite player text.
- Structured proposed events -> validation -> transactional commit -> HUD update. Regeneration must not commit duplicate events. User can accept/reject/undo uncertain extracted events.
- Provide versioned integration interface for NPC Router: actor location/presence, relationship state, knowledge visibility, clock, events and perception constraints. Do not require NPC Router to be installed.

## Deliverables / phases
1. Research and document exact SillyTavern client APIs, event ordering, generation hooks, extension persistence, group generation and limitations in hosted installations. Cite source files/URLs and tested versions. Produce architecture and risk report **before implementation**.
2. Scaffold manifest, JS modules, styles, settings, state store, test harness, minimal HUD, install instructions.
3. Implement deterministic clock, actor locations, inventory and event log, with tests.
4. Implement hearing mechanics and perception-context injection, with tests including zero battery/removed/charging/overload.
5. Implement remaining modules iteratively behind feature flags, each with tests.
6. Integrate NPC Router contract; verify no duplicate generation or secret-knowledge leaks.

## Acceptance criteria
- Works on hosted SillyTavern from installed GitHub extension without server shell.
- Reload, chat switch, regenerate and time skip do not corrupt or double-apply state.
- Battery=0, removed or charging prevents hearing-derived dialogue in injected context.
- Inventory and bank balances cannot change without auditable validated events.
- NPC-private facts do not appear in player-known HUD or unrelated NPC context.
- No invented API calls or unsupported promises of fully autonomous behavior.

## Open design decisions
Exact hearing thresholds, battery rates, interference values, menstrual phase lengths, conception risks, trimester lengths, stress-risk formulas, dice/DC bands, critical tables, time costs, injury debuffs, currency settings, and desired visual theme must be elicited from the user or made editable placeholders. Never silently choose lore-critical defaults.
