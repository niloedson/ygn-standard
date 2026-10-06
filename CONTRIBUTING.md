# Contributing to the YGN Standard

Thank you for your interest in contributing to the **Yu-Gi-Oh! Game Notation (YGN)** open standard! 

This repository follows an open, community-driven **RFC (Request for Comments)** process modeled after the Rust and React RFC workflows.

---

## The RFC Lifecycle

Every substantial modification to the YGN specification, syntax tokens, or board serialization must go through the RFC lifecycle:

```
[Idea / Discussion] ──> [Draft RFC (PR)] ──> [Community Review & Debate]
                                                       │
                                                       ▼
[Implemented & Shipped] <── [Accepted] <── [Final Comment Period (14 Days)]
```

1. **Drafting:** Copy `rfcs/0000-template.md` to `rfcs/000X-my-proposal.md`. Fill out all sections thoroughly.
2. **Pull Request:** Open a Pull Request on GitHub. Use the standard PR template.
3. **Review & Debate:** Developers from simulator platforms (Dueling Book, EDOPro, YGO Omega, YGOPRODeck) review tokens, point out syntactic ambiguities, and suggest refinements.
4. **Final Comment Period (FCP):** A 14-day window where the working group announces intent to accept or reject the proposal.
5. **Acceptance & Implementation:** Once merged, the RFC status becomes `Accepted` and reference parsers are updated.

---

## When is an RFC Required?

An RFC is **required** for:
* Introducing new action operators (e.g. adding a new summoning procedure).
* Modifying zone coordinate naming conventions.
* Changing board snapshot serialization (YBN).
* Adding new stochastic primitives or metadata tags.

An RFC is **not required** for:
* Bug fixes in reference converter scripts (`src/converters/`).
* Documentation spelling and grammatical corrections.
* Adding non-breaking unit tests or test fixtures.

---

## Code Contribution Standards

* All TypeScript code must compile under `strict: true` without errors.
* Every parser change must be validated against real-world transcripts in `fixtures/`.
* Code must run natively in modern Node.js (v20+) using ES Modules.
