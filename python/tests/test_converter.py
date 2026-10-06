"""
Verification test for Python YGN reference library
"""

import os
import sys

# Ensure ygn package is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from ygn import convert_duelingbook_to_ygn, parse_ygn

def test_duelingbook_conversion():
    fixture_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../fixtures/sample_match.raw.txt"))
    with open(fixture_path, "r", encoding="utf-8") as f:
        raw_text = f.read()

    print(f"=== Python YGN Reference Implementation Verification ===")
    print(f"-> Input Raw Log: {len(raw_text)} bytes, {len(raw_text.splitlines())} lines")

    result = convert_duelingbook_to_ygn(raw_text)

    print("-> Python Conversion Results:")
    print(f"   Lines: {result['original_lines_count']} -> {result['ygn_lines_count']}")
    print(f"   Bytes: {result['original_byte_size']} -> {result['ygn_byte_size']} ({result['compression_percent']}% compression)")
    print(f"   Actions Detected: {result['actions_detected']}")

    assert result["actions_detected"] > 40, "Should detect at least 40 game actions"
    assert result["compression_percent"] > 60.0, "Should achieve at least 60% byte compression"
    assert "T1:" in result["ygn_text"], "Should contain Turn 1 header"

    print("-> Testing Python YGN Lexer AST Parsing on converted text...")
    doc = parse_ygn(result["ygn_text"])
    assert len(doc.turns) > 0, "AST should parse at least 1 turn"
    print(f"   Parsed {len(doc.turns)} turns in Python AST.")

    print("\n>>> ALL PYTHON YGN TESTS PASSED! <<<")

if __name__ == "__main__":
    test_duelingbook_conversion()
