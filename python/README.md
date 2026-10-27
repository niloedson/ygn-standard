# `ygn`: Yu-Gi-Oh! Game Notation (RFC 0001) for Python

[![RFC 0001](https://img.shields.io/badge/standard-RFC_0001_(YGN%2FYBN)-8b5cf6.svg)](https://niloedson.github.io/projects/ygn-standard.html)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Python Version](https://img.shields.io/badge/python-3.9+-brightgreen.svg)](https://python.org)

The official Python reference implementation, AST parser, and match transcription engine for **RFC 0001: Yu-Gi-Oh! Game Notation (YGN)** and **Yu-Gi-Oh! Board Notation (YBN)**.

Designed for competitive duelists, data scientists, and machine learning researchers building game state analysis pipelines.

---

## Features

- **⚡ Dueling Book De-noising & Transcriber:** Strips 90%+ browser clickstream noise in milliseconds, converting raw duel logs into clean algebraic notation.
- **🛡️ Negation Attribution:** Detects negation interactions (*Crossout Designator*, *Called by the Grave*, Counter Traps) and cleanly maps `!NEG(EFF)` resolution plies.
- **🥊 Multi-Game Demarcation:** Automatically partitions Best-of-3 match logs into distinct game rounds (`[Round "Game 1"]`, `[Round "Game 2"]`).
- **👁️ 3-Tier Fog-of-War Visibility:** Supports `Omniscient`, `Pilot_P1`, and `Spectator` perspectives with masked private hands (`?`).
- **🌳 AST Parser & Lexer:** Parses `.ygn` documents into structured Python dataclasses (`YgnDocument`, `YgnTurn`, `YgnPhase`, `YgnChainBlock`, `YbnSnapshot`).
- **📊 14-Zone YBN Synthesis:** Computes standardized board snapshots at terminal turns.

---

## Installation

```bash
pip install ygn
```

---

## Quickstart

### 1. Command-Line Interface (CLI)

```bash
# Convert a raw Dueling Book duel log into formatted YGN
ygn duel_log.txt -o match.ygn --stats

# Transcribe with pilot fog-of-war and indented LIFO chain stack
ygn duel_log.txt --format indented --visibility pilot > match.ygn

# Read from stdin
cat duel_log.txt | ygn -s
```

### 2. Python API

```python
from ygn import convert_duelingbook_to_ygn, parse_ygn

# 1. Convert raw text clickstream
with open("duel_log.txt", "r", encoding="utf-8") as f:
    raw_log = f.read()

result = convert_duelingbook_to_ygn(raw_log, options={
    "chain_format": "indented",
    "visibility": "omniscient"
})

print(f"Noise reduction: {result['noise_percent']}%")
print(f"Byte compression: {result['compression_percent']}%")
print(result["ygn_text"])

# 2. Parse YGN transcript into structured AST
doc = parse_ygn(result["ygn_text"])
for turn in doc.turns:
    print(f"Turn {turn.turn_number}: {turn.player} ({len(turn.phases)} phases)")
```

---

## Specification & Standards

* **RFC 0001 Specification:** [https://niloedson.github.io/projects/ygn-standard.html](https://niloedson.github.io/projects/ygn-standard.html)
* **GitHub Repository:** [https://github.com/niloedson/ygn-standard](https://github.com/niloedson/ygn-standard)

---

## License

MIT License &copy; 2026 Haunted Labs & Yu-Gi-Oh! Open Tooling Working Group.
