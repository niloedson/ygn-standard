"""
Verification test for Python YGN reference library & converter
Matches test/converter.test.ts (TypeScript parity test)
"""

import os
import sys

# Ensure ygn package is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from ygn import convert_duelingbook_to_ygn, parse_ygn
from ygn.converter import attribute_chain_resolutions, partition_raw_lines_into_games


def test_sample_match_conversion():
    fixture_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../fixtures/sample_match.raw.txt"))
    with open(fixture_path, "r", encoding="utf-8") as f:
        raw_text = f.read()

    print("=== Python YGN Reference Implementation & Converter Verification ===")
    print(f"-> Input Raw Log: {len(raw_text)} bytes, {len(raw_text.splitlines())} lines")

    result = convert_duelingbook_to_ygn(raw_text, options={"chain_format": "indented", "visibility": "omniscient"})

    print("-> Python Conversion Results:")
    print(f"   Lines: {result['original_lines_count']} -> {result['ygn_lines_count']}")
    print(f"   Bytes: {result['original_byte_size']} -> {result['ygn_byte_size']} ({result['compression_percent']}% compression)")
    print(f"   Actions Detected: {result['actions_detected']}")

    assert result["actions_detected"] > 40, "Should detect at least 40 game actions"
    assert float(result["compression_percent"]) > 50.0, "Should achieve substantial byte compression"
    assert float(result["noise_percent"]) > 60.0, "Should achieve >60% noise reduction"
    assert "T1:" in result["ygn_text"], "Should contain Turn 1 header"
    assert "@DP" in result["ygn_text"], "Should contain Draw Phase"
    assert "+H[" in result["ygn_text"], "Should contain initial hand draw"
    assert "YBN: T" in result["ygn_text"], "Should contain terminal YBN snapshot"

    # Test AST parsing
    print("-> Testing Python YGN Lexer AST Parsing on generated transcript...")
    doc = parse_ygn(result["ygn_text"])
    assert len(doc.turns) > 0, "AST should parse at least 1 turn"
    print(f"   Parsed {len(doc.turns)} turns in Python AST.")


def test_visibility_perspectives():
    fixture_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../fixtures/sample_match.raw.txt"))
    with open(fixture_path, "r", encoding="utf-8") as f:
        raw_text = f.read()

    print("-> Testing Visibility Perspectives (Omniscient, Pilot, Spectator)...")
    res_omni = convert_duelingbook_to_ygn(raw_text, options={"visibility": "omniscient"})
    assert '[Visibility "Omniscient"]' in res_omni["ygn_text"]
    assert "?" not in res_omni["ygn_text"].split("@M1")[0]

    res_pilot = convert_duelingbook_to_ygn(raw_text, options={"visibility": "pilot"})
    assert '[Visibility "Pilot_P1"]' in res_pilot["ygn_text"]
    assert "o.+H[?, ?, ?, ?, ?]<o.D" in res_pilot["ygn_text"]

    res_spec = convert_duelingbook_to_ygn(raw_text, options={"visibility": "spectator"})
    assert '[Visibility "Spectator"]' in res_spec["ygn_text"]
    assert "+H[?, ?, ?, ?, ?]<D" in res_spec["ygn_text"]
    assert "o.+H[?, ?, ?, ?, ?]<o.D" in res_spec["ygn_text"]

    print("   Successfully validated Omniscient, Pilot, and Spectator visibility modes in Python.")


def test_chain_formats():
    fixture_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../fixtures/sample_match.raw.txt"))
    with open(fixture_path, "r", encoding="utf-8") as f:
        raw_text = f.read()

    print("-> Testing Chain Formats (Indented LIFO Stack vs Inline)...")
    res_indented = convert_duelingbook_to_ygn(raw_text, options={"chain_format": "indented"})
    assert "C1: " in res_indented["ygn_text"]
    assert "R1: " in res_indented["ygn_text"]

    res_inline = convert_duelingbook_to_ygn(raw_text, options={"chain_format": "inline"})
    assert "//" in res_inline["ygn_text"]
    print("   Successfully validated Indented and Inline chain formats in Python.")


def test_negation_attribution():
    print("-> Testing Negation Attribution Logic (Crossout & Direct Negations)...")
    # Test Crossout Designator negating CL1
    chain_links = [
        {"type": "ACTIVATE", "card": "Mulcharmy Purulia", "origin": "H", "dest": "GY"},
        {"type": "ACTIVATE", "card": "Crossout Designator", "origin": "H", "dest": "S3"}
    ]
    raw_res = [">BX[Mulcharmy Purulia]<D", "+H[Draw]<D"]
    attributed = attribute_chain_resolutions(chain_links, raw_res)
    assert len(attributed) == 2
    assert "!NEG(EFF)" in attributed[0], "CL1 Purulia should be negated by Crossout"
    assert ">BX[Mulcharmy Purulia]<D" in attributed[1], "CL2 Crossout should resolve banishing Purulia"

    print("   Successfully validated negation attribution in Python.")


def test_best_of_three_partitioning():
    bo3_fixture = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../fixtures/duel_log_test.txt"))
    if not os.path.exists(bo3_fixture):
        print("   Skipping Bo3 fixture test (fixture not found).")
        return

    with open(bo3_fixture, "r", encoding="utf-8") as f:
        raw_text = f.read()

    print("=== Testing Python Best-of-3 Match Fixture (duel_log_test.txt) ===")
    result = convert_duelingbook_to_ygn(raw_text, options={"chain_format": "indented"})
    print(f"-> Match Conversion: {result['original_lines_count']} lines -> {result['ygn_lines_count']} YGN lines ({result['noise_percent']}% noise stripped)")

    assert '[Round "Game 1"]' in result["ygn_text"], "Must detect Game 1"
    assert '[Round "Game 2"]' in result["ygn_text"], "Must detect Game 2"
    assert "YBN: T" in result["ygn_text"], "Must include YBN snapshots"

    doc = parse_ygn(result["ygn_text"])
    assert len(doc.turns) >= 5, "AST should parse multiple turns across games"
    print(f"   AST parsed {len(doc.turns)} turns across Best-of-3 games in Python.")


if __name__ == "__main__":
    test_sample_match_conversion()
    test_visibility_perspectives()
    test_chain_formats()
    test_negation_attribution()
    test_best_of_three_partitioning()
    print("\n>>> ALL PYTHON YGN TESTS PASSED SUCCESSFULLY! <<<")
