# RFC 0001 (YGN / YBN): Comprehensive Ecosystem Adoption Strategy & Operational Roadmap

**Document Version:** 1.0.0  
**Status:** Approved / Actionable Strategy  
**Owner:** Yu-Gi-Oh! Open Tooling Working Group & Haunted Labs Studio  
**Target Specifications:** [`rfcs/0001-ygn-specification.md`](../rfcs/0001-ygn-specification.md) & [`docs/RFC_GOVERNANCE.md`](RFC_GOVERNANCE.md)  

---

## Executive Summary

Trading card game notations succeed only when they achieve an **unfair advantage in convenience, visual impact, or competitive insight**. Chess players can manually record PGN moves on physical scoresheets; digital Yu-Gi-Oh! players will **never manually write notation**. 

Universal adoption of **RFC 0001 (YGN / YBN)** requires a multi-tiered ecosystem strategy where:
1. **Friction is reduced to 1 click** on popular manual simulators.
2. **Text notation is backed by an interactive visual web player** for content creators and casual viewers.
3. **Data scientists and pro players receive unique meta insights** (empirical chokepoint win-rates) made possible only by algebraic indexing.
4. **Simulator developers are freed from binary replay obsolescence** through native engine hooks.
5. **Archetype communities are gamified** to contribute verified mathematical lines.

This document details the **5 strategic pillars**, providing a step-by-step implementation guide, persona alignment, technical architecture, and success metrics for each.

---

## Ecosystem Architecture & Persona Matrix

```
                                  THE YGN ADOPTION FUNNEL
                                             │
      ┌──────────────────────────────────────┼──────────────────────────────────────┐
      ▼                                      ▼                                      ▼
[ COMPETITIVE DUELISTS ]              [ CONTENT CREATORS ]                  [ DATA SCIENTISTS ]
• Dueling Book Users                  • Streamers, Casters, YouTubers       • Meta Analysts, Pro Teams
• Target: 1-Click Clipboard           • Target: Interactive Visual Board    • Target: Pandas / ML Datasets
• Asset: ygn-db-helper Extension      • Asset: ygn-replayer Web HUD         • Asset: ygn Python Package
      │                                      │                                      │
      └──────────────────────────────────────┼──────────────────────────────────────┘
                                             │
                                             ▼
                                  [ SIMULATOR ENGINES ]
                                  • EDOPro, YGO Omega, ocgcore
                                  • Target: Zero Replay Obsolescence
                                  • Asset: ygn_emitter.lua
```

| Strategy | Primary Persona | Technical Asset | Core Value Proposition |
| :--- | :--- | :--- | :--- |
| **Pillar 1: Zero-Friction Extension** | DB Grinders, Tournament Players | `ygn-db-helper` (Userscript / WebExt) | Eliminates copy-paste friction; 1-click clipboard export directly inside Dueling Book. |
| **Pillar 2: Interactive Web Replayer** | Streamers, Casters, Casual Fans | `ygn-replayer` (Component) | Visual Chess.com-style board with animated Chain HUD and card artwork. |
| **Pillar 3: Empirical Meta Study** | Pro Players, Theorycrafters, YouTubers| `ygn` Python Package & Jupyter Notebooks | First-of-its-kind big-data analysis of hand trap chokepoints and lethal conversion. |
| **Pillar 4: Drop-in Simulator Hook** | Simulator Maintainers (EDOPro, Omega) | `ygn_emitter.lua` | Replaces version-locked binary `.yrp` files with durable, permanent text replays. |
| **Pillar 5: Gamified Theory Bounties** | Archetype Discord Communities | `ygo-archetypes` & Bounty CI | Author prestige: immortalizes optimal playlines in community-owned repositories. |

---

## Pillar 1: The Dueling Book Zero-Friction Browser Extension (`ygn-db-helper`)

### 1.1. Strategic Objective
Reduce match export friction from **4 manual steps** (export log $\to$ select text $\to$ open `notary.html` $\to$ paste) to **a single click (`[📋 Copy as YGN]`) directly on Dueling Book**.

### 1.2. Architecture & Cloudflare Turnstile Resilience
* Single-file **Tampermonkey Userscript** (`ygn-duelingbook.user.js`) for instant power-user install.
* Zero-dependency **Chrome/Firefox WebExtension (Manifest V3)** for one-click Web Store installation.
* Inlines the lightweight client-side `duelingbookToYgn` engine (<22KB unminified).
* **Cloudflare Turnstile Resilience:** Dueling Book replay pages (`/replay?id=...`) protect replay data behind a Cloudflare Turnstile challenge (`loadTurnstile()` issuing a POST to `view-replay`). Automated external scrapers fail, but the Userscript / WebExtension executes **client-side inside the authenticated browser session after Turnstile verification completes**. This bypasses Cloudflare completely with zero CAPTCHA solving overhead.

### 1.3. Step-by-Step Implementation Guide
1. **Targeting & Dual-Context Injection:**
   * Match rules: `@match https://www.duelingbook.com/duel*`, `@match https://www.duelingbook.com/replay*`, and `@match https://www.duelingbook.com/`.
   * **Live Match Room:** Target `#chat_tools` or `#duel_log .chat_top_bg` and inject `<button id="btnYgnCopy" class="ygn-btn">⚡ Copy as YGN</button>`.
   * **Replay Room:** Observe post-Turnstile completion (`#turnstile_bg` hidden or `updateDuelLog` calls). Inject `[⚡ Copy as YGN]` into the replay transport bar (next to `#pause_replay_btn`) and in `#duel_log .log_tools`.
2. **Event Interception & Extraction:**
   * **DOM Extraction:** Read `#duel_log .log_txt` or simulate native export text extraction.
   * **Memory Interception:** Read in-memory arrays `window.duel_logs` or intercept the `view-replay` JSON payload (`data.logs`) directly upon `loadReplayComplete`.
3. **Background Transcription:**
   * Pass the extracted string into the inlined `convertDuelingBookToYgn(rawLog, { chainFormat: 'indented', visibility: 'omniscient' })`.
4. **Clipboard Handshake & Visual Feedback:**
   * Copy the formatted YGN string using `navigator.clipboard.writeText(result.ygnText)`.
   * Display an animated on-screen HUD toast: `✓ Transcribed (83% noise stripped) — Copied to Clipboard!`.
5. **Distribution & Release:**
   * Host `ygn-duelingbook.user.js` in `userscripts/` with automatic update headers (`@updateURL`, `@downloadURL`).
   * Provide a 1-click install button on `niloedson.github.io/tools/notary.html`.
   * Submit to the Chrome Web Store and Firefox Add-ons repository under *Haunted Labs Open Commons*.

### 1.4. Key Metric
* Over **500 weekly active users** copying YGN transcripts directly from Dueling Book within 90 days.

---

## Pillar 2: The Interactive Chess.com-Style Web Replayer (`ygn-replayer`)

### 2.1. Strategic Objective
Provide a visually engaging, embeddable web replayer that renders YGN transcripts as interactive 2D boards with card images, timeline scrubbing, and animated chain call stacks.

### 2.2. Architecture
* Zero-dependency Vanilla Web Component (`<ygn-replayer>`) or standalone page on `niloedson.github.io/tools/replayer.html`.
* CDN integration with YGOPRODeck API (`https://images.ygoprodeck.com/images/cards/`) for high-resolution card artwork.
* Pure client-side state machine computing YBN board states on every step.

### 2.3. Step-by-Step Implementation Guide
1. **Topology & Zone Grid Canvas:**
   * Render the standardized 14-zone board (M1..M5, S1..S5, EL, ER, FS, GY, Banish, Hand count) using pure CSS Grid.
2. **Ply-by-Ply State Machine:**
   * Ingest YGN documents via `parseYgn()` into the structured AST.
   * Maintain an in-memory game state tuple: $\langle T, \Phi, \mathbf{LP}, \mathbf{Zones}_1, \mathbf{Zones}_2 \rangle$.
   * Cache a YBN keyframe at every move to support instant scrubbing without lag.
3. **Animated Chain Stack Call Frame HUD:**
   * For multi-link chains ($N \ge 2$), animate a vertical call stack overlay:
     - Push frame upon $C_k$ declaration (growing deeper).
     - Glow golden during priority pass (`//`).
     - Pop frame upon $R_k$ resolution (unwinding in reverse order).
4. **Branching Variation Viewer:**
   * Support embedded SGF-style alternative branches `(varA: ...)` allowing users to toggle between *"Actual Playline"* and *"Optimal Route Plays around Nibiru"*.
5. **Shareable URL Hash Generator:**
   * Encode YGN transcripts into compressed URL fragments (`#lz=...`), allowing players to share specific turns or board states via a single hyperlink.

### 2.4. Key Metric
* Featured as an interactive demonstration on **YGOPRODeck** or in community deck profile guides.

---

## Pillar 3: The Big-Data Empirical Chokepoint Meta Study in Python (`ygn-analytics`)

### 3.1. Strategic Objective
Establish undeniable competitive credibility by publishing an empirical meta-analysis that is impossible to generate from noisy simulator logs, positioning `ygn` as the data science standard for competitive Yu-Gi-Oh!.

### 3.2. Architecture
* The official Python package: `ygn` (`pip install ygn`).
* Jupyter Notebooks using Pandas, Polars, and Seaborn for statistical computing and visualization.
* A public dataset of 1,000+ competitive match logs converted to YGN.

### 3.3. Step-by-Step Implementation Guide
1. **Engine Synchronization (`python/ygn/converter.py`):**
   * Port the recent TypeScript updates to Python: multi-game match partitioning, implicit hand trap inference, and negation attribution (`attributeChainResolutions`).
2. **Cloudflare-Resilient Corpus Assembly:**
   * *Anti-Scraping Constraint:* Naive HTTP requests (`urllib`, `requests`) against Dueling Book replay URLs fail due to Cloudflare Turnstile verification.
   * *Three-Tier Sourcing Model:*
     1. **Crowdsourced Telemetry via Match Notary & Userscript:** Enable an opt-in checkbox on `notary.html` and `ygn-duelingbook.user.js` (*"Contribute anonymous YGN record to Open Research Corpus"*).
     2. **Tournament Organizer (TO) Archives:** Ingest offline `duel_log.txt` logs collected by judges during Remote YCS and Discord tournament top cuts.
     3. **Local Browser Harvester:** When batching replay IDs, run a local Playwright script with persistent user profile cookies to allow Turnstile verification rather than unauthenticated server-side requests.
   * Batch transcribe into `.ygn` records using `ygn transcribe --stats`.
3. **Feature Engineering & DataFrame Ingestion:**
   * Extract key metrics into tabular form:
     - Opening hand quality & starter count.
     - Interaction Deficit ($\Delta I = N_{\text{Disruptions}} - N_{\text{Vectors}}$).
     - Chain Link 1 targets vs. Chain Link 2 hand trap choices.
     - Terminal turn board values ($V(\text{YBN})$).
4. **Empirical Study Authorship:**
   * Author the canonical paper:  
     **"Where to Drop the Hand Trap: An Empirical Chokepoint Analysis of 1,000 Competitive Matches using YGN Algebraic Notation"**.
   * Compare empirical win rates:
     - *Ash Blossom* targeting Starter A vs Starter B.
     - *Mulcharmy Fuwalos* resolution impact on Turn 2 lethal conversion.
5. **Public Promotion & Community Release:**
   * Release the article and open-source Jupyter Notebook on the Haunted Labs Studio blog.
   * Cross-post to `/r/yugioh`, pro player Discord communities, and tag competitive analysts on social platforms.

### 3.4. Key Metric
* Over **1,000 PyPI downloads** of `ygn` and coverage by at least one prominent competitive content creator.

---

## Pillar 4: The EDOPro / YGO Omega Drop-In Replay Exporter (`ygn_emitter.lua`)

### 4.1. Strategic Objective
Solve the 15-year-old digital TCG problem of **replay obsolescence** by hooking directly into automated simulator engines (`ocgcore`) to write durable, permanent text YGN records upon match completion.

### 4.2. Architecture
* `lua/ygn_emitter.lua`: Lightweight Lua event emitter mapping `ocgcore` bitmasks directly to YGN algebraic tokens.
* Integration hooks for Project Ignis EDOPro (`script/single.lua` or system event listeners).

### 4.3. Step-by-Step Implementation Guide
1. **Engine Hook Audit:**
   * Identify EDOPro's match lifecycle callbacks:
     - `Duel.RegisterEffect` / `Duel.Activate` $\to$ triggers `YGNEmitter:chain_declare()`.
     - `Duel.SpecialSummon` / `Duel.Summon` $\to$ triggers `YGNEmitter:emit_special_summon()` / `emit_normal_summon()`.
     - `Duel.Damage` / `Duel.PayLPCost` $\to$ triggers `YGNEmitter:emit_lp_delta()`.
2. **Drop-in Script Packaging:**
   * Author `lua/ygn_hook.lua` that wraps `ygn_emitter.lua` and attaches to `single.lua` with zero modification to the underlying C++ simulator executable.
3. **Dual Replay Serialization:**
   * At duel completion (`Duel.Win`), the hook writes:
     1. `replays/match_20261021.yrp` (Native binary replay).
     2. `replays/match_20261021.ygn` (Human-readable RFC 0001 algebraic record).
4. **Community PR & Core Integration:**
   * Submit documentation and pull request templates to the **Project Ignis** and **YGO Omega** GitHub repositories demonstrating zero CPU overhead (<1ms per turn).

### 4.4. Key Metric
* Official integration or approved community plugin in at least one major automated simulator.

---

## Pillar 5: Gamified Theory Bounties on `ygo-archetypes`

### 5.1. Strategic Objective
Crowdsource verified, mathematically optimal playlines across 50+ competitive archetypes by tapping into the pride and expertise of archetype specialists.

### 5.2. Architecture
* The community repository: `github.com/niloedson/ygo-archetypes`.
* Automated PR submission via `submit-archetype-theory.html`.
* Automated GitHub Actions CI validating YGN syntax and YBN terminal snapshots on every Pull Request.

### 5.3. Step-by-Step Implementation Guide
1. **Archetype Bounty Issue Board:**
   * Open structured GitHub Issues labeled `[Playline Bounty]`:
     - *"[Bounty]: Earth Machine Turn 1 Blind Second OTK line under Fuwalos"*.
     - *"[Bounty]: Labrynth optimal virus setup playing around Red Reboot"*.
2. **Form Integration (`submit-archetype-theory.html`):**
   * Connect the "Send to Archetype Theory Form" button in `notary.html` so that transcribed match lines automatically populate the submission form.
3. **Automated CI Validation (`scripts/validate_archetypes.mjs`):**
   * GitHub Actions runs on every Pull Request:
     - Audits RFC 0001 YGN syntax compliance.
     - Verifies card passcodes against `ygoprodeck-mcp`.
     - Validates that terminal YBN snapshots balance resource gates (`NS <= 1`, HOPT checks).
4. **Prestige & Author Attribution:**
   * Successful contributors are permanently immortalized in the archetype's canonical markdown guide (e.g. `archetypes/revol_bots/revol_bots.md` listing *"Canonical Line Authors: @username"*).

### 5.4. Key Metric
* Over **25 community-contributed archetypes** with verified YGN playlines within 6 months.

---

## Phased Execution Roadmap

```
[ PHASE 1: Friction Killer (Month 1) ]
  ├── Package ygn-db-helper Tampermonkey Userscript
  ├── Release ygo-notary CLI on npm registry
  └── Synchronize python/ygn/converter.py with latest TS updates

[ PHASE 2: Visual Impact & Data Authority (Months 2–3) ]
  ├── Deploy interactive Web Replayer on niloedson.github.io
  ├── Ingest 1,000 matches and publish the Empirical Chokepoint Study
  └── Release ygn on PyPI (Python Package Index)

[ PHASE 3: Simulator & Community Scaling (Months 4–6) ]
  ├── Provide drop-in EDOPro replay export Lua script
  ├── Launch Archetype Theory Bounty Program on ygo-archetypes
  └── Propose RFC 0001 formally to YGOPRODeck / Yu-Gi-Oh! Meta platforms
```

---

## Conclusion

By executing these 5 grounded strategies, **YGN / YBN** transitions from a technical specification into an indispensable everyday utility. By solving real friction points for duelists, creators, and developers, we establish an open, permanent algebraic foundation for digital trading card games.
