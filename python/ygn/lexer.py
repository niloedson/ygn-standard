"""
Reference Lexer & AST Parser for YGN in Python
Part of YGN-Standard RFC 0001
"""

import re
from typing import Optional
from .types import (
    CardToken,
    YgnActionLine,
    YgnChainBlock,
    YgnChainLink,
    YgnChainResolution,
    YgnDocument,
    YgnPhase,
    YgnSingleAction,
    YgnTurn
)

VALID_ZONES = {
    "M1", "M2", "M3", "M4", "M5",
    "S1", "S2", "S3", "S4", "S5",
    "EL", "ER", "FS", "H", "D", "ED", "GY", "BX", "BF",
    "o.M1", "o.M2", "o.M3", "o.M4", "o.M5",
    "o.S1", "o.S2", "o.S3", "o.S4", "o.S5",
    "o.FS", "o.H", "o.D", "o.ED", "o.GY", "o.BX", "o.BF"
}

def parse_single_action(action_text: str) -> YgnSingleAction:
    action_text = action_text.strip()
    operator = "A"
    card = CardToken()
    position = None
    zone = None
    origin_zone = None
    target_zone = None

    if action_text.startswith("N"): operator = "N"
    elif action_text.startswith("#N"): operator = "#N"
    elif action_text.startswith("S"): operator = "S"
    elif action_text.startswith("A"): operator = "A"
    elif action_text.startswith("#S"): operator = "#S"
    elif action_text.startswith("+H"): operator = "+"
    elif action_text.startswith("!"): operator = "!"
    elif action_text.startswith("X"): operator = "X"
    elif action_text.startswith("L"): operator = "L"
    elif action_text.startswith("F"): operator = "F"
    elif action_text.startswith("Y"): operator = "Y"
    elif action_text.startswith("R"): operator = "R"
    elif action_text.startswith("LP"): operator = "LP"

    card_match = re.search(r"\[(?:([a-z0-9#]+):)?([^\]]+)\]", action_text, re.IGNORECASE)
    if card_match:
        card = CardToken(alias=card_match.group(1), name=card_match.group(2))

    if "(atk)" in action_text: position = "atk"
    elif "(def)" in action_text: position = "def"

    dest_match = re.search(r">(o\.[A-Za-z0-9]+|[A-Za-z0-9]+)", action_text)
    if dest_match and dest_match.group(1) in VALID_ZONES:
        zone = dest_match.group(1)

    orig_match = re.search(r"<(o\.[A-Za-z0-9]+|[A-Za-z0-9]+)", action_text)
    if orig_match and orig_match.group(1) in VALID_ZONES:
        origin_zone = orig_match.group(1)

    targ_match = re.search(r"T>(o\.[A-Za-z0-9]+|[A-Za-z0-9]+)", action_text)
    if targ_match and targ_match.group(1) in VALID_ZONES:
        target_zone = targ_match.group(1)

    return YgnSingleAction(
        operator=operator,
        card=card,
        position=position,
        zone=zone,
        origin_zone=origin_zone,
        target_zone=target_zone,
        raw_text=action_text
    )

def parse_action_line(line: str) -> Optional[YgnActionLine]:
    line = line.strip()
    if line.startswith("[C") and "//" in line:
        glyph_match = re.search(r"\](!|!!|\?|\?\?|!\?|\?!)$", line)
        glyph = glyph_match.group(1) if glyph_match else None
        inner = re.sub(r"^\[", "", re.sub(r"\](?:\S+)?$", "", line))
        parts = [p.strip() for p in inner.split("//")]
        decl_part = parts[0]
        res_part = parts[1] if len(parts) > 1 else ""

        decls = []
        for chunk in re.split(r">\s*(?=C\d+:)", decl_part):
            m = re.match(r"^C(\d+):\s*(.+)$", chunk.strip())
            link_num = int(m.group(1)) if m else 1
            act_str = m.group(2) if m else chunk.strip()
            decls.append(YgnChainLink(link_number=link_num, action=parse_single_action(act_str)))

        resolutions = []
        for chunk in re.split(r">\s*(?=R\d+:)", res_part):
            m = re.match(r"^R(\d+):\s*(.+)$", chunk.strip())
            link_num = int(m.group(1)) if m else 1
            res_str = m.group(2) if m else chunk.strip()
            resolutions.append(YgnChainResolution(link_number=link_num, resolution_text=res_str))

        return YgnChainBlock(
            declarations=decls,
            resolutions=resolutions,
            glyph=glyph,
            raw_text=line
        )

    return parse_single_action(line)

def parse_ygn(text: str) -> YgnDocument:
    lines = text.splitlines()
    headers = {}
    deck1_aliases = {}
    deck2_aliases = {}
    turns = []

    current_turn: Optional[YgnTurn] = None
    current_phase: Optional[YgnPhase] = None
    in_deck1_aliases = False
    in_deck2_aliases = False

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue

        tag_match = re.match(r'^\[([A-Za-z0-9_]+)\s+"([^"]*)"\]$', line)
        if tag_match:
            headers[tag_match.group(1)] = tag_match.group(2)
            continue

        if line == "[Deck1_Aliases]":
            in_deck1_aliases = True
            in_deck2_aliases = False
            continue
        if line == "[Deck2_Aliases]":
            in_deck1_aliases = False
            in_deck2_aliases = True
            continue

        if in_deck1_aliases or in_deck2_aliases:
            if line.startswith("["):
                in_deck1_aliases = False
                in_deck2_aliases = False
            else:
                alias_match = re.match(r"^([a-z0-9#]+):(?:(\d+):)?(.+)$", line, re.IGNORECASE)
                if alias_match:
                    k = alias_match.group(1)
                    p = int(alias_match.group(2)) if alias_match.group(2) else None
                    name = alias_match.group(3).strip()
                    if in_deck1_aliases:
                        deck1_aliases[k] = {"passcode": p, "name": name}
                    else:
                        deck2_aliases[k] = {"passcode": p, "name": name}
                    continue

        turn_match = re.match(r"^T(\d+):\s*([^\s]+)(?:\s+(?:vs|\(.*\))\s+(.+))?", line, re.IGNORECASE)
        if turn_match:
            turn_num = int(turn_match.group(1))
            p1 = turn_match.group(2).strip()
            p2 = turn_match.group(3).strip() if turn_match.group(3) else ("Player 2" if turn_num % 2 == 1 else "Player 1")
            current_turn = YgnTurn(turn_number=turn_num, turn_player=p1, opponent=p2, phases=[])
            turns.append(current_turn)
            current_phase = None
            continue

        if line.startswith("@"):
            current_phase = YgnPhase(phase=line.upper(), actions=[])
            if current_turn:
                current_turn.phases.append(current_phase)
            continue

        if current_phase:
            parsed = parse_action_line(line)
            if parsed:
                current_phase.actions.append(parsed)

    return YgnDocument(
        headers=headers,
        deck1_aliases=deck1_aliases,
        deck2_aliases=deck2_aliases,
        turns=turns,
        raw_text=text
    )
