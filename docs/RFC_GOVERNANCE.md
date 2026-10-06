# YGN RFC Governance & Revisor Playbook

This document is the official editorial handbook for the **Lead Revisor** and working group members managing the **Yu-Gi-Oh! Game Notation (YGN)** RFC lifecycle.

---

## 1. Role of the Lead Revisor

As Lead Revisor, you are the custodian of the YGN specification. Your primary responsibilities are:
1. **Preserve Syntactic Determinism:** Ensure every proposed token and grammar rule can be parsed without ambiguity or backtracking.
2. **Prevent Feature Bloat:** Resist simulator-specific quirks; keep notation pure, algebraic, and simulator-agnostic.
3. **Enforce Multi-Language Parity:** Ensure syntax changes are implementable across **TypeScript**, **Python**, and **Lua 5.1/LuaJIT**.
4. **Maintain Deterministic Replays:** Ensure that applying actions sequentially reproduces 100% accurate game and board states (YBN).

---

## 2. Technical Evaluation Rubric

Before advancing any RFC towards acceptance, evaluate it against the **Four Core Tenets**:

### Tenet 1: Syntactic Determinism & Parseability
* Can the new syntax be scanned by an LL(1) tokenizer or standard regular expressions?
* Does it collide with existing zone coordinates (`M1..M5`, `S1..S5`, `F1`, `GY`, `B`, `ED`, `EX`), player prefixes (`o.`), or phase markers (`@DP`, `@SP`, `@M1`, `@BP`, `@M2`, `@EP`)?
* Does it introduce ambiguities when card names contain punctuation (e.g. `"D/D/D"`, `"CNo."`, colons, brackets)?

### Tenet 2: Game-Engine Invariants (Yu-Gi-Oh! Mechanics)
* **Simultaneous Triggers (SEGOC):** Does the syntax properly sequence mandatory and optional triggers in the same chain building phase?
* **Private Information:** Does the syntax preserve hidden information integrity (e.g., set cards, cards in hand, face-down banish) without leaking private card IDs prematurely?
* **Resolution Order:** Does the proposal handle nested or non-standard resolutions (e.g., chain links that modify subsequent chain execution)?

### Tenet 3: Multi-Language & Constrained Environment Viability
* Can this be implemented cleanly in:
  * Modern TypeScript (ESM, strict typing)?
  * Python (standard library, typing, regex)?
  * **Lua 5.1 / LuaJIT** (standard for game simulators such as EDOPro/Omega, with no native modern regex engines)?

### Tenet 4: Mandatory Golden Fixtures
* Every proposal affecting notation **must provide at least one realistic fixture** showing raw transcript input and expected parsed output.

---

## 3. Step-by-Step Triage & Lifecycle Management

```
[PR Created] ──> [1. Triage] ──> [2. In-Review] ──> [3. FCP (14 Days)] ──> [4. Accepted] ──> [5. Implemented]
                                                              │
                                                              └──> [Rejected]
```

### Stage 1: Triage (New PR Opened)
1. Verify the PR author created their file from `rfcs/0000-template.md`.
2. Check if the next sequential RFC number was assigned (e.g. `rfcs/0002-...md`).
3. Run `npm run rfc:lint` locally or verify CI passes.
4. If incomplete: apply `rfc:draft` and request missing sections.
5. If complete: apply `rfc:in-review` and notify simulator developers.

### Stage 2: Active Review & Community Debate
* Point simulator authors (Dueling Book, EDOPro, YGO Omega, YGOPRODeck) to the PR.
* Use GitHub PR reviews to comment directly on specific sections or lines.
* If edge cases or ambiguities are discovered, ask the author to update Section 4 (*Drawbacks & Edge Cases*) or Section 6 (*Unresolved Questions*).

### Stage 3: Entering the Final Comment Period (FCP)
When all questions are resolved and consensus forms:
1. Announce intent to **Accept** or **Reject**.
2. Start a **14-day countdown window**.
3. Update PR labels: remove `rfc:in-review`, add `rfc:fcp`.
4. Post the standard FCP announcement comment (see templates below).

### Stage 4: Resolution
* **If objections arise:** Return to `rfc:in-review` or update the proposal.
* **If FCP expires cleanly:**
  * Update RFC header to `* **Status:** Accepted`.
  * Update `rfcs/README.md` status table.
  * Squash and merge the Pull Request.
  * Apply label `rfc:accepted`.

### Stage 5: Implementation Tracking
* Track reference parser updates in TypeScript (`src/`), Python (`python/`), and Lua (`lua/`).
* Once all test fixtures pass in all three runtimes, update RFC status in `rfcs/README.md` to `Implemented` and apply label `rfc:implemented`.

---

## 4. Revisor Comment Templates

### Template A: Entering Final Comment Period (Intent to Accept)
```markdown
The review period for this proposal has concluded and community consensus has been reached.

I am placing this proposal into a **14-day Final Comment Period (FCP)** with a disposition to **Merge (Accept)**.

* **FCP Start:** YYYY-MM-DD
* **FCP End:** YYYY-MM-DD
* **Proposed Disposition:** Accept and Merge into Standards Track

If no major unresolved flaws, syntactic collisions, or game-engine edge cases are raised before the deadline, this RFC will be officially merged as **RFC XXXX**.
```

### Template B: Entering Final Comment Period (Intent to Reject)
```markdown
After careful evaluation against the YGN Technical Rubric, this proposal cannot be accepted in its current form due to:
* [State technical reasons: e.g. token collision, unsolvable Lua parsing complexity, violation of private knowledge rules]

I am placing this proposal into a **14-day Final Comment Period (FCP)** with a disposition to **Close (Reject)**.

* **FCP Start:** YYYY-MM-DD
* **FCP End:** YYYY-MM-DD
* **Proposed Disposition:** Reject
```

### Template C: Acceptance & Merge Announcement
```markdown
The Final Comment Period has elapsed with no outstanding objections or breaking edge cases.

This proposal is now officially **Accepted** as **RFC XXXX**.

**Next Steps:**
- [ ] Incorporate syntax changes into living specification.
- [ ] Add golden fixtures to `fixtures/`.
- [ ] Implement parser updates in `src/` (TypeScript).
- [ ] Implement parser updates in `python/ygn/` (Python).
- [ ] Update `lua/` emitter hooks.
```

---

## 5. Command-Line (CLI) Revisor Cheat Sheet

You can manage the entire RFC lifecycle without leaving your terminal using the GitHub CLI (`gh`) and Git:

### Initial Setup (Sync Labels)
```bash
# Sync all RFC lifecycle and area labels to your GitHub repository
npm run labels:sync
```

### Reviewing and Triaging PRs
```bash
# List all active RFC proposals in review
gh pr list --label "rfc:in-review"

# Checkout and inspect a contributor's RFC branch
gh pr checkout <PR_NUMBER>

# Run RFC structure linting locally
npm run rfc:lint

# Run full cross-language test suite
npm test
npm run test:py
```

### Transitioning States
```bash
# Move from Draft to In-Review
gh pr edit <PR_NUMBER> --remove-label "rfc:draft" --add-label "rfc:in-review"

# Move to Final Comment Period (FCP)
gh pr edit <PR_NUMBER> --remove-label "rfc:in-review" --add-label "rfc:fcp"

# Post FCP Announcement comment
gh pr comment <PR_NUMBER> --body-file fcp-comment.md

# Merge when accepted
gh pr merge <PR_NUMBER> --squash
```

### Tagging Releases & Publishing
```bash
# Create a signed or annotated release tag
git tag -a v0.2.0 -m "Release v0.2.0: Includes RFC 0002"
git push origin v0.2.0

# Create the GitHub Release directly from CLI
gh release create v0.2.0 --title "v0.2.0 - Specification Update" --generate-notes
```
