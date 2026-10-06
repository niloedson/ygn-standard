# YGN Standard RFC Registry

This directory contains the official **Requests for Comments (RFCs)** for the **Yu-Gi-Oh! Game Notation (YGN)** and **Yu-Gi-Oh! Board Notation (YBN)** standards.

Every modification to the grammar, token syntax, board snapshot serialization, or simulator integration protocol must be proposed, debated, and approved through this RFC process.

---

## The RFC Lifecycle

Proposals advance through a deterministic state machine:

```
[Draft] ──> [In-Review] ──> [Final Comment Period (FCP)] ──> [Accepted] ──> [Implemented]
                                      │
                                      └──> [Rejected / Withdrawn]
```

| Lifecycle State | Description | GitHub Label |
| :--- | :--- | :--- |
| **Draft** | Initial proposal being drafted by the author. May be incomplete. | `rfc:draft` |
| **In-Review** | Under active discussion by simulator developers, judges, and toolmakers. | `rfc:in-review` |
| **FCP** | **Final Comment Period (14 Days)**: Consensus reached, announcing intent to Accept or Reject. | `rfc:fcp` |
| **Accepted** | Formally accepted and merged into the specification track. Ready for implementation. | `rfc:accepted` |
| **Implemented** | Shipped and tested across all reference parsers (TypeScript, Python, and Lua). | `rfc:implemented` |
| **Rejected** | Not adopted due to syntactic collisions, game engine incompatibility, or lack of consensus. | `rfc:rejected` |
| **Superseded** | Previously accepted standard rendered obsolete by a newer RFC. | `rfc:superseded` |

---

## Active & Historical RFCs

| RFC # | Title | Status | Target Date / Merged | Spec Chapter | Reference PR |
| :---: | :--- | :---: | :---: | :---: | :---: |
| **`0001`** | [Yu-Gi-Oh! Game Notation (YGN) & Board Notation (YBN) Standard](0001-ygn-specification.md) | **Proposed / Draft** | 2026-10-06 | Core Spec | Initial |

---

## Multi-Language Implementation Parity Matrix

To ensure the ecosystem never fragments, an accepted RFC only transitions to **Implemented** when reference parsers in all three supported tiers pass identical test fixtures:

| RFC # | Title | Spec Status | TypeScript (`src/`) | Python (`python/`) | Lua (`lua/`) | Golden Fixtures |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| `0001` | Core YGN & YBN Algebraic Grammar | Proposed | ✅ Complete | ✅ Complete | ⚠️ Emitter Only | `fixtures/sample_match.ygn` |

---

## Proposing a New RFC

1. Review [`docs/RFC_GOVERNANCE.md`](../docs/RFC_GOVERNANCE.md) to understand the technical criteria and expectations.
2. Copy [`0000-template.md`](0000-template.md) to `rfcs/000X-feature-name.md` (use the next sequential number).
3. Open a Pull Request on GitHub titled `RFC 000X: [Feature Name]`.
4. Ensure the RFC includes concrete before/after examples and addresses drawbacks.
5. Validate formatting locally by running `npm run rfc:lint`.
