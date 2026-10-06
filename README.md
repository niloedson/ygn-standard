# YGN Standard (Yu-Gi-Oh! Game Notation)

The open, human-readable, deterministic algebraic standard for competitive Yu-Gi-Oh! match logs, game state snapshots, and AI arbitration—modeled after **Chess PGN and FEN**.

> 📜 **Read the [Open Letter to the Yu-Gi-Oh! Community](OPEN_LETTER.md)** on the vision behind this project and my aspiration for the game's competitive future.

```text
T1: nedsonbr vs THE WORLD
@SP
  [C1: A(o.H)[#o1:Purulia]>o.GY // R1: OK ~LING(o.+H<D on S<H>)]
@M1
  [C1: A(H)[#1:Exceptional]>S3 // R1: S[Token]>M3, +H[#2:Urgent]<D, [#1]>GY]
  [C1: A(H)[#2:Urgent]>S3 // R1: S[#3:NightTrain](def)>M4<D, S[#4:Harvester](def)>M3<D, [#2]>GY]
  L[#4:M3 + #3:M4]>ER[#e1:Genius](atk)<ED
```

---

## The Problem
For 25 years, digital Yu-Gi-Oh! has been fragmented:
* Manual simulators (such as Dueling Book) export raw **browser DOM clickstreams** (`duel_log.txt`), where 91% of lines are UI noise (`"Viewed deck"`, `"Signaled OK"`). A 3-turn duel produces **734 lines and 32KB of text**.
* Automated simulators (YGO Omega, Project Ignis EDOPro) record matches in closed **binary replay files (`.yrp`)** that desynchronize when card databases update and cannot be read by LLMs, search engines, or web replayers.

---

## The Solution: YGN & YBN

* **YGN (Yu-Gi-Oh! Game Notation):** Action-based algebraic grammar capturing summons, activations, target selections, and LIFO chain resolution stacks.
* **YBN (Yu-Gi-Oh! Board Notation):** Snapshot descriptor (FEN equivalent) encoding physical card positions across all 14 field zones in a single line.
* **Deck-Scoped Alias Registry:** Maps `.ydk` passcodes to compact `#1..#40` tokens, achieving an **88% to 94% compression ratio** over raw simulator logs.

---

## Active RFC Status & Governance

The YGN Standard follows an open, community-driven RFC process. See the **[RFC Registry & Parity Index](rfcs/README.md)** for full details and the **[Revisor & Governance Playbook](docs/RFC_GOVERNANCE.md)** for lifecycle guidelines.

| RFC | Title | Status | Link |
| :---: | :--- | :---: | :--- |
| **0001** | Yu-Gi-Oh! Game Notation (YGN) & Board Notation (YBN) Standard | **Proposed / Draft** | [`rfcs/0001-ygn-specification.md`](rfcs/0001-ygn-specification.md) |

---

## Quick Start & Verification

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Reference Parser Tests
```bash
npm test
```

### 3. Convert a Dueling Book Log to YGN (TypeScript)
```typescript
import { convertDuelingBookToYgn } from "ygn-standard";
import fs from "node:fs";

const rawLog = fs.readFileSync("my_duel.txt", "utf-8");
const ygnResult = convertDuelingBookToYgn(rawLog);

console.log(`Original: ${rawLog.length} bytes -> YGN: ${ygnResult.ygnText.length} bytes`);
console.log(`Compression: ${ygnResult.compressionPercent}%`);
fs.writeFileSync("my_duel.ygn", ygnResult.ygnText);
```

### 4. Python Data Science & Meta Analytics
```bash
cd python
pip install -e .
python -m unittest tests/test_converter.py
```
```python
from ygn import convert_duelingbook_to_ygn, parse_ygn

# Analyze tournament match transcripts in Python/Pandas
result = convert_duelingbook_to_ygn(raw_text)
doc = parse_ygn(result["ygn_text"])
print(f"Parsed {len(doc.turns)} turns across {result['actions_detected']} actions")
```

### 5. Lua / ocgcore Event Hook (Project Ignis EDOPro, YGO Omega)
```lua
local YGNEmitter = require("lua.ygn_emitter")
local emitter = YGNEmitter.new("Player 1", "Player 2", "TCG Advanced")

emitter:start_turn(1, 0)
emitter:emit_normal_summon(0, "Infinitrack Harvester", 2)
emitter:chain_declare(1, 0, "Infinitrack Harvester", 0x04, 2)
emitter:chain_resolve(1, "Added Brutal Dozer to hand")
emitter:finish_chain()

print(emitter:get_transcript())
```

---

## Multi-Language Ecosystem Map

| Language | Target Component | Status | Location |
| :--- | :--- | :---: | :--- |
| **TypeScript** | Web Replayers, Dueling Book, Node.js, MCP Servers | **Production** | [`src/`](src/) |
| **Python** | Meta Scraping, ML Duel Bots, Pandas/Data Science | **Production** | [`python/`](python/) |
| **Lua** | `ocgcore` rules engine, YGO Omega, Project Ignis EDOPro | **Production** | [`lua/`](lua/) |

---

## Repository Structure

* `rfcs/`: The formal Requests for Comments proposing and refining standards.
* `src/`: TypeScript reference AST, lexer, and Dueling Book converter.
* `python/`: Python 3.9+ package (`ygn`) with AST types, lexer, and converter.
* `lua/`: Pure Lua 5.1 event emitter for `ocgcore` simulators.
* `fixtures/`: Golden test files (`.raw.txt` and `.ygn`).
* `test/`: Automated TypeScript test suite.
* `python/tests/`: Automated Python test suite.

---

## Contributing & RFC Process

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for how to submit improvements, dispute edge cases, or propose new RFCs using [`rfcs/0000-template.md`](rfcs/0000-template.md).

## License

MIT © 2026 Yu-Gi-Oh! Open Tooling Working Group

