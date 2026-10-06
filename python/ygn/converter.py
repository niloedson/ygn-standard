"""
Reference Converter: Dueling Book Raw Clickstream -> YGN v1.1 in Python
Part of YGN-Standard RFC 0001
"""

import re
from typing import Dict, Any

NOISE_PATTERNS = [
    re.compile(r"Signaled OK", re.I),
    re.compile(r"Viewed deck", re.I),
    re.compile(r"Stopped viewing Deck", re.I),
    re.compile(r"Shuffled deck", re.I),
    re.compile(r"Viewed Extra Deck", re.I),
    re.compile(r"Stopped viewing Extra Deck", re.I),
    re.compile(r"Viewed GY", re.I),
    re.compile(r"Stopped viewing GY", re.I),
    re.compile(r"Viewed Opponent's", re.I),
    re.compile(r"Stopped viewing Opponent's", re.I),
    re.compile(r"Shuffled hand", re.I),
    re.compile(r"Thinking", re.I),
    re.compile(r"Chose to go first", re.I),
    re.compile(r"glhf", re.I)
]

def is_noise_line(line: str) -> bool:
    return any(p.search(line) for p in NOISE_PATTERNS)

def normalize_zone(zone_str: str) -> str:
    z = zone_str.strip()
    if z in ("Right EMZ", "Right Extra Monster Zone"): return "ER"
    if z in ("Left EMZ", "Left Extra Monster Zone"): return "EL"
    if z == "Field Spell Zone": return "FS"
    if z.startswith("M-"): return f"M{z[2:]}"
    if z.startswith("S-"): return f"S{z[2:]}"
    if z.startswith("hand"): return "H"
    return z

def convert_duelingbook_to_ygn(raw_log_text: str) -> Dict[str, Any]:
    raw_lines = [l.strip() for l in raw_log_text.splitlines() if l.strip()]
    headers = {
        "Format": "TCG Advanced",
        "Site": "Dueling Book"
    }

    ygn_output_lines = []
    p1_name = "Player 1"
    p2_name = "Player 2"
    current_turn = 0
    current_phase = "@M1"
    active_turn_player = ""
    action_count = 0

    for i in range(min(len(raw_lines), 10)):
        l = raw_lines[i]
        host_match = re.search(r"\[\d+:\d+\]\s+([A-Z0-9_\-\s]+)\s+hosted\s+(?:2 out of 3|1 out of 1)\s+Match\s+in\s+([A-Za-z0-9_\-\s()]+)", l, re.I)
        if host_match:
            p1_name = host_match.group(1).strip()
            headers["Format"] = host_match.group(2).strip()
        accept_match = re.search(r"Accepted\s+([A-Za-z0-9_\-\s]+)\s+into duel", l, re.I)
        if accept_match:
            p2_name = accept_match.group(1).strip()

    ygn_output_lines.append('[Event "Dueling Book Match"]')
    ygn_output_lines.append(f'[Player1 "{p1_name}" 8000]')
    ygn_output_lines.append(f'[Player2 "{p2_name}" 8000]')
    ygn_output_lines.append(f'[Format "{headers["Format"]}"]')
    ygn_output_lines.append("")

    pending_actions = []

    def flush_phase():
        nonlocal pending_actions
        if pending_actions:
            ygn_output_lines.append(current_phase)
            for act in pending_actions:
                ygn_output_lines.append(f"  {act}")
            pending_actions = []

    for line in raw_lines:
        turn_match = re.search(r"----------------\(Turn\s+(\d+)\)----------------", line, re.I)
        if turn_match:
            flush_phase()
            current_turn = int(turn_match.group(1))
            active_turn_player = p1_name if current_turn % 2 == 1 else p2_name
            ygn_output_lines.append(f"T{current_turn}: {active_turn_player}")
            current_phase = "@M1"
            continue

        if is_noise_line(line):
            continue

        if re.search(r"Entered Standby Phase", line, re.I):
            flush_phase()
            current_phase = "@SP"
            continue
        if re.search(r"Entered Main Phase 1", line, re.I):
            flush_phase()
            current_phase = "@M1"
            continue
        if re.search(r"Entered Battle Phase", line, re.I):
            flush_phase()
            current_phase = "@BP"
            continue
        if re.search(r"Entered Main Phase 2", line, re.I):
            flush_phase()
            current_phase = "@M2"
            continue
        if re.search(r"Entered End Phase", line, re.I):
            flush_phase()
            current_phase = "@EP"
            continue

        content = re.sub(r"^\[\d+:\d+\]\s*", "", line).strip()

        ns_match = re.search(r"Normal Summoned\s+(.+?)\s+from\s+(.+?)\s+to\s+(.+)", content, re.I)
        if ns_match:
            card = ns_match.group(1).strip()
            zone = normalize_zone(ns_match.group(3))
            pending_actions.append(f"N[{card}]>{zone}")
            action_count += 1
            continue

        ss_match = re.search(r"Special Summoned\s+(.+?)\s+from\s+(.+?)\s+to\s+([^(]+)(?:\s+\((ATK|DEF)\))?", content, re.I)
        if ss_match:
            card = ss_match.group(1).strip()
            origin = normalize_zone(ss_match.group(2))
            zone = normalize_zone(ss_match.group(3))
            pos = f"({ss_match.group(4).lower()})" if ss_match.group(4) else ""
            pending_actions.append(f"S[{card}]{pos}>{zone}<{origin}")
            action_count += 1
            continue

        act_match = re.search(r"Activated\s+(?:Field Spell\s+)?(.+?)\s+from\s+(.+?)\s+to\s+(.+)", content, re.I)
        if act_match:
            card = act_match.group(1).strip()
            zone = normalize_zone(act_match.group(3))
            pending_actions.append(f"[C1: A({zone})[{card}]]")
            action_count += 1
            continue

        decl_match = re.search(r"Declared effect of\s+(.+?)\s+(?:in|from)\s+(.+)", content, re.I)
        if decl_match:
            card = decl_match.group(1).strip()
            zone = normalize_zone(decl_match.group(2))
            pending_actions.append(f"A({zone})[{card}]")
            action_count += 1
            continue

        point_match = re.search(r"Pointed at\s+(.+?)\s+(?:from|in)\s+(.+)", content, re.I)
        if point_match:
            card = point_match.group(1).strip()
            zone = normalize_zone(point_match.group(2))
            pending_actions.append(f"T>{zone}[{card}]")
            action_count += 1
            continue

        add_match = re.search(r"Added\s+(.+?)\s+from\s+(.+?)\s+to hand", content, re.I)
        if add_match:
            card = add_match.group(1).strip()
            origin = normalize_zone(add_match.group(2))
            pending_actions.append(f"+H[{card}]<{origin}")
            action_count += 1
            continue

        placed_match = re.search(r"Placed\s+(.+?)\s+from\s+(.+?)\s+to\s+(.+)", content, re.I)
        if placed_match:
            card = placed_match.group(1).strip()
            origin = normalize_zone(placed_match.group(2))
            zone = normalize_zone(placed_match.group(3))
            pending_actions.append(f"[{card}]>{zone}<{origin}")
            action_count += 1
            continue

        xyz_match = re.search(r"Overlayed\s+(.+?)\s+in\s+(.+?)\s+onto\s+(.+?)\s+in\s+(.+)", content, re.I)
        if xyz_match:
            mat_a = xyz_match.group(1).strip()
            mat_b = xyz_match.group(3).strip()
            zone_b = normalize_zone(xyz_match.group(4))
            pending_actions.append(f"X[{mat_a}+{mat_b}]>{zone_b}")
            action_count += 1
            continue

        detach_match = re.search(r"Detached Xyz Material\s+(.+?)\s+from\s+(.+?)\s+in\s+(.+)", content, re.I)
        if detach_match:
            mat = detach_match.group(1).strip()
            zone = normalize_zone(detach_match.group(3))
            pending_actions.append(f"!{zone}[{mat}]>GY")
            action_count += 1
            continue

        sent_match = re.search(r"Sent\s+(.+?)\s+from\s+(.+?)\s+to\s+(.+)", content, re.I)
        if sent_match:
            card = sent_match.group(1).strip()
            dest = normalize_zone(sent_match.group(3))
            pending_actions.append(f"[{card}]>{dest}")
            action_count += 1
            continue

        lp_match = re.search(r"(Lost|Gained)\s+(\d+)\s+LP", content, re.I)
        if lp_match:
            op = "-" if lp_match.group(1).lower() == "lost" else "+"
            amt = lp_match.group(2)
            pending_actions.append(f"LP{op}{amt}")
            action_count += 1
            continue

        if content.startswith('"') and content.endswith('"'):
            chat = content[1:-1].strip()
            if chat and "glhf" not in chat.lower():
                pending_actions.append(f'// Chat: "{chat}"')
            continue

    flush_phase()

    ygn_text = "\n".join(ygn_output_lines)
    orig_bytes = len(raw_log_text.encode("utf-8"))
    ygn_bytes = len(ygn_text.encode("utf-8"))
    compression_percent = round(((orig_bytes - ygn_bytes) / (orig_bytes or 1)) * 100, 1)

    return {
        "headers": headers,
        "ygn_text": ygn_text,
        "original_lines_count": len(raw_lines),
        "ygn_lines_count": len(ygn_output_lines),
        "original_byte_size": orig_bytes,
        "ygn_byte_size": ygn_bytes,
        "compression_percent": compression_percent,
        "actions_detected": action_count
    }
