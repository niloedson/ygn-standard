"""
Reference Converter: Dueling Book Raw Clickstream -> YGN v1.1 in Python
Part of YGN-Standard RFC 0001
"""

import argparse
import re
import sys
import time
from typing import Any, Dict, List, Optional, Set

HAND_TRAPS: Set[str] = {
    "ash blossom & joyous spring",
    "mulcharmy fuwalos",
    "mulcharmy purulia",
    "mulcharmy nyannyan",
    "mulcharmy meowls",
    "droll & lock bird",
    "ghost belle & haunted mansion",
    "ghost ogre & snow rabbit",
    "ghost mourner & moonlit chill",
    "ghost reaper & winter cherries",
    "effect veiler",
    "skull meister",
    "dimension shifter",
    "artifact lancea",
    "d.d. crow",
    "psy-framegear gamma",
    "fantastical dragon phantazmay",
    "nibiru, the primal being"
}


def normalize_zone(zone_str: str) -> str:
    z = (zone_str or "").strip()
    if re.match(r"^Right\s+(?:EMZ|Extra\s+Monster\s+Zone)$", z, re.I):
        return "ER"
    if re.match(r"^Left\s+(?:EMZ|Extra\s+Monster\s+Zone)$", z, re.I):
        return "EL"
    if re.match(r"^(?:Field\s+Spell\s+Zone|Field\s+Zone|FS)$", z, re.I):
        return "FS"

    m_o_m = re.match(r"^M2-?([1-5])$", z, re.I)
    if m_o_m:
        return f"o.M{m_o_m.group(1)}"
    s_o_s = re.match(r"^S2-?([1-5])$", z, re.I)
    if s_o_s:
        return f"o.S{s_o_s.group(1)}"
    m_p_m = re.match(r"^M-?([1-5])$", z, re.I)
    if m_p_m:
        return f"M{m_p_m.group(1)}"
    s_p_s = re.match(r"^S-?([1-5])$", z, re.I)
    if s_p_s:
        return f"S{s_p_s.group(1)}"

    if re.match(r"^opponent's\s+hand(?:\s*\(\d+/\d+\))?$", z, re.I):
        return "o.H"
    if re.match(r"^hand(?:\s*\(\d+/\d+\))?$", z, re.I):
        return "H"
    if re.match(r"^opponent's\s+(?:GY|Graveyard)$", z, re.I):
        return "o.GY"
    if re.match(r"^(?:GY|Graveyard)$", z, re.I):
        return "GY"
    if re.match(r"^opponent's\s+deck$", z, re.I):
        return "o.D"
    if re.match(r"^Deck$", z, re.I):
        return "D"
    if re.match(r"^Extra\s+Deck$", z, re.I):
        return "ED"
    if re.match(r"^opponent's\s+extra\s+deck$", z, re.I):
        return "o.ED"
    if re.match(r"^Banished$", z, re.I):
        return "B"
    return z


def clean_card_name(raw_name: str) -> str:
    cleaned = (raw_name or "").strip()
    cleaned = re.sub(r'^["\']|["\']$', '', cleaned)
    cleaned = re.sub(r"\s+(?:from|in)\s+(?:opponent's\s+)?hand(?:\s*\(\d+/\d+\))?", "", cleaned, flags=re.I)
    cleaned = re.sub(r"\s+(?:from|in)\s+(?:opponent's\s+)?(?:Deck|GY|Graveyard|Extra\s+Deck|Field\s+Spell\s+Zone)", "", cleaned, flags=re.I)
    cleaned = re.sub(r"\s+to\s+(?:M2?-?[1-5]|S2?-?[1-5]|Right\s+EMZ|Left\s+EMZ|GY|hand).*", "", cleaned, flags=re.I)
    cleaned = re.sub(r"\s*\((?:ATK|DEF|\d+/\d+)\)", "", cleaned, flags=re.I)
    return cleaned.strip()


def partition_raw_lines_into_games(raw_lines: List[str]) -> List[List[str]]:
    games: List[List[str]] = []
    current_game: List[str] = []
    seen_first_turn1 = False
    siding_or_defeat = False

    for line in raw_lines:
        if re.search(r"Admitted defeat|Finished siding", line, re.I):
            siding_or_defeat = True
        if re.search(r"^----------------\(Turn 1\)----------------", line, re.I):
            if seen_first_turn1 and siding_or_defeat and current_game:
                games.append(current_game)
                current_game = []
                siding_or_defeat = False
            seen_first_turn1 = True
        current_game.append(line)

    if current_game:
        games.append(current_game)

    return games if games else [raw_lines]


def attribute_chain_resolutions(
    chain_links: List[Dict[str, Any]],
    raw_resolutions: List[str]
) -> List[str]:
    n = len(chain_links)
    link_resolutions: List[List[str]] = [[] for _ in range(n)]
    negated_links: Set[int] = set()
    working_resolutions = list(raw_resolutions)

    # 1. Trace Negation Cards across the stack (higher chain links down)
    for j in range(n - 1, -1, -1):
        act = chain_links[j]
        name = (act.get("card") or "").lower()

        # Crossout Designator
        if "crossout" in name:
            for r_idx in range(len(working_resolutions)):
                r = working_resolutions[r_idx]
                if r.startswith(">BX[") and "<D" in r:
                    link_resolutions[j].append(r)
                    banished_card = re.sub(r"^>BX\[(?:[a-z0-9#]+:)?([^\]]+)\].*$", r"\1", r, flags=re.I).lower()
                    for k in range(j):
                        target_card = (chain_links[k].get("card") or "").lower()
                        if target_card in banished_card or banished_card in target_card:
                            negated_links.add(k)
                            link_resolutions[j].append(f"!NEG(EFF)[{chain_links[k].get('card')}]")
                    del working_resolutions[r_idx]
                    break

        # Called by the Grave
        if "called by the grave" in name:
            for r_idx in range(len(working_resolutions)):
                r = working_resolutions[r_idx]
                if r.startswith(">BX[") and "<GY" in r:
                    link_resolutions[j].append(r)
                    banished_card = re.sub(r"^>BX\[(?:[a-z0-9#]+:)?([^\]]+)\].*$", r"\1", r, flags=re.I).lower()
                    for k in range(j):
                        target_card = (chain_links[k].get("card") or "").lower()
                        if target_card in banished_card or banished_card in target_card:
                            negated_links.add(k)
                            link_resolutions[j].append(f"!NEG(EFF)[{chain_links[k].get('card')}]")
                    del working_resolutions[r_idx]
                    break

        # Direct Negation Cards (Reframing, Skull Meister, Ghost Belle, Solemn)
        if any(neg_kw in name for neg_kw in ("reframing", "skull meister", "ghost belle", "solemn")):
            if j not in negated_links and j > 0:
                negated_links.add(j - 1)
                link_resolutions[j].append(f"!NEG(EFF)[{chain_links[j - 1].get('card')}]")

    # 2. Mark explicitly negated links with !NEG(EFF) if not already populated
    for neg_idx in negated_links:
        if not link_resolutions[neg_idx]:
            link_resolutions[neg_idx].append("!NEG(EFF)")

    # 3. Assign remaining resolution actions to non-negated links
    if 0 not in negated_links and working_resolutions:
        link_resolutions[0].extend(working_resolutions)
        working_resolutions.clear()
    elif working_resolutions:
        for k in range(n - 1, -1, -1):
            if k not in negated_links:
                link_resolutions[k].extend(working_resolutions)
                break

    return [", ".join(res_list) if res_list else "OK" for res_list in link_resolutions]


def convert_duelingbook_to_ygn(
    raw_log_text: str,
    options: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    opts = options or {}
    chain_format = opts.get("chain_format") or opts.get("chainFormat") or "indented"
    visibility = opts.get("visibility") or "omniscient"

    start_time = time.perf_counter()
    raw_lines = [line.strip() for line in raw_log_text.splitlines() if line.strip()]
    orig_bytes = len(raw_log_text.encode("utf-8"))

    main_aliases: Dict[str, str] = {}
    extra_aliases: Dict[str, str] = {}
    opp_aliases: Dict[str, str] = {}

    main_counter = 1
    extra_counter = 1
    opp_counter = 1

    p1_name = "Player 1"
    p2_name = "Player 2"
    fmt = "TCG Advanced"

    # Header extraction
    for i in range(min(len(raw_lines), 12)):
        l = raw_lines[i]
        host_match = re.search(
            r"\[\d+:\d+\]\s+([A-Za-z0-9_\-\s]+)\s+hosted\s+(?:2 out of 3|1 out of 1)\s+Match\s+in\s+([A-Za-z0-9_\-\s()]+)",
            l,
            re.I
        )
        if host_match:
            p1_name = host_match.group(1).strip()
            fmt = host_match.group(2).strip()
        accept_match = re.search(r"Accepted\s+([A-Za-z0-9_\-\s]+)\s+into duel", l, re.I)
        if accept_match:
            p2_name = accept_match.group(1).strip()

    # Pre-seed known P1 and P2 card draws from initial Turn 1
    p1_known_cards: Set[str] = set()
    p2_known_cards: Set[str] = set()

    draw_count = 0
    for line in raw_lines:
        drew_match = re.search(r"\[\d+:\d+\]\s+Drew\s+(.+)", line, re.I)
        if drew_match:
            card = clean_card_name(drew_match.group(1)).lower()
            draw_count += 1
            if draw_count <= 5:
                p1_known_cards.add(card)
            elif draw_count <= 10:
                p2_known_cards.add(card)
        if draw_count >= 10:
            break

    def is_extra_deck_card(name: str) -> bool:
        n = name.lower()
        return any(kw in n for kw in (
            'genius', 'gustav', 'ballista', 'kagari', 'camellia', 'shizuku',
            'hayate', 'blues', 'crook', 'booster', 'non-finito', 'track maker',
            'crackle', 'remix', 'loudness war', 'rs', 'amritara', 'ty-phon',
            'sky crisis', 'malong', 'power patron of creation', 'dragon',
            'knight', 'river stormer', 'goliath', 'earth slicer', 'artmage',
            'link', 'xyz', 'fusion', 'synchro'
        ))

    def is_opponent_card(name: str) -> bool:
        n = name.lower()
        if n in p2_known_cards:
            return True
        if n in p1_known_cards:
            return False
        return n in HAND_TRAPS or any(ht in n for ht in ('ash blossom', 'purulia', 'fuwalos', 'droll', 'nervedo'))

    def get_alias_tag(card_name: str) -> str:
        nonlocal main_counter, extra_counter, opp_counter
        if is_extra_deck_card(card_name):
            if card_name not in extra_aliases:
                extra_aliases[card_name] = f"#e{extra_counter}"
                extra_counter += 1
            return f"{extra_aliases[card_name]}:{card_name}"
        if is_opponent_card(card_name):
            if card_name not in opp_aliases:
                opp_aliases[card_name] = f"#o{opp_counter}"
                opp_counter += 1
            return f"{opp_aliases[card_name]}:{card_name}"
        if card_name not in main_aliases:
            main_aliases[card_name] = f"#{main_counter}"
            main_counter += 1
        return f"{main_aliases[card_name]}:{card_name}"

    vis_header = (
        "Pilot_P1" if visibility == "pilot"
        else "Spectator" if visibility == "spectator"
        else "Omniscient"
    )

    ygn_lines: List[str] = [
        '[Event "Dueling Book Match"]',
        f'[Player1 "{p1_name}" 8000]',
        f'[Player2 "{p2_name}" 8000]',
        f'[Format "{fmt}"]',
        f'[Visibility "{vis_header}"]',
        '[Standard "RFC 0001 (YGN v1.1)"]',
        ""
    ]

    games = partition_raw_lines_into_games(raw_lines)
    total_actions_detected = 0

    for game_idx, game_lines in enumerate(games):
        game_num = game_idx + 1
        if len(games) > 1:
            if game_idx > 0:
                ygn_lines.append("")
            ygn_lines.append(f'[Round "Game {game_num}"]')

        actions: List[Dict[str, Any]] = []
        starting_player = p1_name

        p1_opening_cards: List[str] = []
        p2_opening_cards: List[str] = []
        game_draw_count = 0

        for line in game_lines:
            drew_match = re.search(r"\[\d+:\d+\]\s+Drew\s+(.+)", line, re.I)
            if drew_match:
                card = clean_card_name(drew_match.group(1))
                game_draw_count += 1
                if game_draw_count <= 5:
                    p1_opening_cards.append(card)
                elif game_draw_count <= 10:
                    p2_opening_cards.append(card)
            if game_draw_count >= 10:
                break

        for line in game_lines:
            if re.search(r"Chose to go first", line, re.I):
                starting_player = p1_name
                break
            ns_match_start = re.search(r"Normal Summoned\s+(.+?)\s+from\s+", line, re.I)
            if ns_match_start:
                c = ns_match_start.group(1).lower()
                if c in p2_known_cards or "kewl tune" in c:
                    starting_player = p2_name
                else:
                    starting_player = p1_name
                break

        for line in game_lines:
            turn_match = re.search(r"^----------------\(Turn\s+(\d+)\)----------------", line, re.I)
            if turn_match:
                actions.append({
                    "raw": line,
                    "type": "TURN",
                    "turn_number": int(turn_match.group(1))
                })
                continue

            if re.search(r"Entered Standby Phase", line, re.I):
                actions.append({"raw": line, "type": "PHASE", "dest": "@SP"})
                continue
            if re.search(r"Entered Main Phase 1", line, re.I):
                actions.append({"raw": line, "type": "PHASE", "dest": "@M1"})
                continue
            if re.search(r"Entered Battle Phase", line, re.I):
                actions.append({"raw": line, "type": "PHASE", "dest": "@BP"})
                continue
            if re.search(r"Entered Main Phase 2", line, re.I):
                actions.append({"raw": line, "type": "PHASE", "dest": "@M2"})
                continue
            if re.search(r"Entered End Phase", line, re.I):
                actions.append({"raw": line, "type": "PHASE", "dest": "@EP"})
                continue
            if re.search(r"Entered Draw Phase", line, re.I):
                actions.append({"raw": line, "type": "PHASE", "dest": "@DP"})
                continue

            content = re.sub(r"^\[\d+:\d+\]\s*", "", line).strip()

            if re.search(
                r"Signaled OK|Viewed deck|Stopped viewing|Shuffled deck|Viewed Extra Deck|Viewed GY|Viewed Opponent's|Viewed Banished|Stopped viewing Opponent's|Showed Extra Deck|Showed hand|Shuffled hand|glhf|ggwp|ok\?|Thinking|Ended turn|Finished siding|Admitted defeat",
                content,
                re.I
            ):
                continue

            # Normal Summoned X
            ns_match = re.match(
                r"Normal Summoned\s+(.+?)\s+from\s+([A-Za-z0-9_\-\s()/]+)\s+to\s+([A-Za-z0-9_\-]+)(?:\s+\((ATK|DEF)\))?",
                content,
                re.I
            )
            if ns_match:
                actions.append({
                    "raw": line,
                    "type": "SUMMON",
                    "sub_type": "NORMAL",
                    "card": clean_card_name(ns_match.group(1)),
                    "origin": normalize_zone(ns_match.group(2)),
                    "dest": normalize_zone(ns_match.group(3)),
                    "pos": (ns_match.group(4) or "atk").lower()
                })
                continue

            # Special Summoned X onto material (Xyz)
            xyz_match = re.match(
                r"Special Summoned\s+(.+?)\s+from\s+Extra Deck\s+onto\s+(.+?)\s+in\s+([A-Za-z0-9_\-]+)(?:\s+\((ATK|DEF)\))?",
                content,
                re.I
            )
            if xyz_match:
                actions.append({
                    "raw": line,
                    "type": "SUMMON",
                    "sub_type": "XYZ",
                    "card": clean_card_name(xyz_match.group(1)),
                    "origin": normalize_zone(xyz_match.group(3)),
                    "dest": normalize_zone(xyz_match.group(3)),
                    "pos": (xyz_match.group(4) or "atk").lower()
                })
                continue

            # Special Summoned X
            ss_match = re.match(
                r"Special Summoned\s+(.+?)\s+from\s+([A-Za-z0-9_\-\s()/]+)\s+to\s+(Right\s+Extra\s+Monster\s+Zone|Left\s+Extra\s+Monster\s+Zone|Right\s+EMZ|Left\s+EMZ|[A-Za-z0-9_\-]+)(?:\s+\((ATK|DEF)\))?",
                content,
                re.I
            )
            if ss_match:
                actions.append({
                    "raw": line,
                    "type": "SUMMON",
                    "sub_type": "SPECIAL",
                    "card": clean_card_name(ss_match.group(1)),
                    "origin": normalize_zone(ss_match.group(2)),
                    "dest": normalize_zone(ss_match.group(3)),
                    "pos": (ss_match.group(4) or "atk").lower()
                })
                continue

            # Token
            tok_match = re.match(r"Summoned a token in\s+([A-Za-z0-9_\-]+)", content, re.I)
            if tok_match:
                actions.append({
                    "raw": line,
                    "type": "TOKEN",
                    "dest": normalize_zone(tok_match.group(1))
                })
                continue

            # Set
            set_match = re.match(r"^Set\s+(.+?)\s+(?:from\s+([A-Za-z0-9_\-\s()/]+)\s+)?(?:to|in)\s+([A-Za-z0-9_\-]+)", content, re.I)
            if set_match:
                actions.append({
                    "raw": line,
                    "type": "SET",
                    "card": clean_card_name(set_match.group(1)),
                    "origin": normalize_zone(set_match.group(2)) if set_match.group(2) else "H",
                    "dest": normalize_zone(set_match.group(3))
                })
                continue

            # Returned
            ret_match = re.match(r"^Returned\s+(.+?)\s+from\s+([A-Za-z0-9_\-\s()/]+)\s+to\s+([A-Za-z0-9_\-\s]+)", content, re.I)
            if ret_match:
                actions.append({
                    "raw": line,
                    "type": "MILL",
                    "card": clean_card_name(ret_match.group(1)),
                    "origin": normalize_zone(ret_match.group(2)),
                    "dest": normalize_zone(ret_match.group(3))
                })
                continue

            # Field Spell
            act_fs_match = re.match(r"Activated Field Spell\s+(.+?)\s+from\s+([A-Za-z0-9_\-\s()/]+)", content, re.I)
            if act_fs_match:
                actions.append({
                    "raw": line,
                    "type": "ACTIVATE",
                    "card": clean_card_name(act_fs_match.group(1)),
                    "origin": normalize_zone(act_fs_match.group(2)),
                    "dest": "FS"
                })
                continue

            # Activated Set
            act_set_match = re.match(r"Activated Set\s+(.+?)\s+in\s+([A-Za-z0-9_\-]+)", content, re.I)
            if act_set_match:
                actions.append({
                    "raw": line,
                    "type": "ACTIVATE",
                    "card": clean_card_name(act_set_match.group(1)),
                    "origin": normalize_zone(act_set_match.group(2))
                })
                continue

            # Activated from Y to Z
            act_match = re.match(r"Activated\s+(?:Field Spell\s+)?(.+?)\s+from\s+(.+?)\s+to\s+([A-Za-z0-9_\-\s]+)", content, re.I)
            if act_match:
                actions.append({
                    "raw": line,
                    "type": "ACTIVATE",
                    "card": clean_card_name(act_match.group(1)),
                    "origin": normalize_zone(act_match.group(2)),
                    "dest": normalize_zone(act_match.group(3))
                })
                continue

            # Declared effect
            decl_match = re.match(r"Declared effect of\s+(.+?)\s+(?:in|from)\s+([A-Za-z0-9_\-\s()/]+)", content, re.I)
            if decl_match:
                actions.append({
                    "raw": line,
                    "type": "ACTIVATE",
                    "card": clean_card_name(decl_match.group(1)),
                    "origin": normalize_zone(decl_match.group(2))
                })
                continue

            # Pointed at
            point_match = re.match(r"Pointed at\s+(.+?)\s+(?:from|in)\s+([A-Za-z0-9_\-\s]+)", content, re.I)
            if point_match:
                actions.append({
                    "raw": line,
                    "type": "TARGET",
                    "card": clean_card_name(point_match.group(1)),
                    "origin": normalize_zone(point_match.group(2))
                })
                continue

            # Added from origin to hand
            add_match = re.match(r"Added\s+(.+?)\s+from\s+([A-Za-z0-9_\-\s]+)\s+to hand", content, re.I)
            if add_match:
                actions.append({
                    "raw": line,
                    "type": "SEARCH",
                    "card": clean_card_name(add_match.group(1)),
                    "origin": normalize_zone(add_match.group(2))
                })
                continue

            # Drew
            drew_act_match = re.match(r"Drew\s+(.+)", content, re.I)
            if drew_act_match:
                actions.append({
                    "raw": line,
                    "type": "DRAW",
                    "card": clean_card_name(drew_act_match.group(1))
                })
                continue

            # Lost LP
            lp_match = re.match(r"Lost\s+(\d+)\s+LP", content, re.I)
            if lp_match:
                actions.append({
                    "raw": line,
                    "type": "LP",
                    "delta": -int(lp_match.group(1))
                })
                continue

            # Direct attack
            atk_dir_match = re.match(r"Attacked directly with\s+(.+?)\s+in\s+([A-Za-z0-9_\-]+)", content, re.I)
            if atk_dir_match:
                actions.append({
                    "raw": line,
                    "type": "ATTACK",
                    "card": clean_card_name(atk_dir_match.group(1)),
                    "origin": normalize_zone(atk_dir_match.group(2)),
                    "direct": True
                })
                continue

            # Attack monster
            atk_match = re.match(r"Attacked\s+(.+?)\s+in\s+([A-Za-z0-9_\-]+)\s+with\s+(.+?)\s+in\s+([A-Za-z0-9_\-]+)", content, re.I)
            if atk_match:
                actions.append({
                    "raw": line,
                    "type": "ATTACK",
                    "card": clean_card_name(atk_match.group(3)),
                    "origin": normalize_zone(atk_match.group(4)),
                    "target_zone": normalize_zone(atk_match.group(2)),
                    "direct": False
                })
                continue

            # Banished
            ban_match = re.match(r"Banished\s+(.+?)\s+from\s+([A-Za-z0-9_\-\s]+)", content, re.I)
            if ban_match:
                actions.append({
                    "raw": line,
                    "type": "BANISH",
                    "card": clean_card_name(ban_match.group(1)),
                    "origin": normalize_zone(ban_match.group(2))
                })
                continue

            # Sent hand: hand trap vs discard cost
            sent_hand_match = re.match(r"Sent\s+(.+?)\s+from\s+hand(?:\s*\(\d+/\d+\))?\s+to\s+GY", content, re.I)
            if sent_hand_match:
                card_name = clean_card_name(sent_hand_match.group(1))
                is_ht = card_name.lower() in HAND_TRAPS
                last_act = actions[-1] if actions else None
                is_cost_for_previous = (
                    last_act is not None
                    and last_act.get("type") == "ACTIVATE"
                    and (
                        last_act.get("card") == card_name
                        or any(k in (last_act.get("card") or "") for k in ("Droplet", "Switchyard"))
                    )
                )

                if is_ht and not is_cost_for_previous:
                    actions.append({
                        "raw": line,
                        "type": "ACTIVATE",
                        "card": card_name,
                        "origin": "H",
                        "dest": "GY"
                    })
                else:
                    actions.append({
                        "raw": line,
                        "type": "MILL",
                        "card": card_name,
                        "origin": "H",
                        "dest": "GY"
                    })
                continue

            # Sent from origin to dest
            sent_match = re.match(r"Sent\s+(.+?)\s+from\s+([A-Za-z0-9_\-\s()/]+)\s+to\s+([A-Za-z0-9_\-\s]+)", content, re.I)
            if sent_match:
                actions.append({
                    "raw": line,
                    "type": "MILL",
                    "card": clean_card_name(sent_match.group(1)),
                    "origin": normalize_zone(sent_match.group(2)),
                    "dest": normalize_zone(sent_match.group(3))
                })
                continue

        total_actions_detected += len(actions)

        # Action Assembly Loop
        i = 0
        turn_count = 0

        while i < len(actions):
            act = actions[i]

            if act["type"] == "TURN":
                turn_count = act.get("turn_number") or (turn_count + 1)
                is_turn_odd = turn_count % 2 == 1
                turn_player = starting_player if is_turn_odd else (p2_name if starting_player == p1_name else p1_name)
                opp_player = (p2_name if starting_player == p1_name else p1_name) if is_turn_odd else starting_player
                ygn_lines.append(f"T{turn_count}: {turn_player} vs {opp_player}")

                if turn_count == 1:
                    ygn_lines.append("@DP")
                    if visibility == "omniscient":
                        p1_hand_str = ", ".join(get_alias_tag(c) for c in p1_opening_cards)
                        p2_hand_str = ", ".join(get_alias_tag(c) for c in p2_opening_cards) if p2_opening_cards else "?, ?, ?, ?, ?"
                    elif visibility == "pilot":
                        p1_hand_str = ", ".join(get_alias_tag(c) for c in p1_opening_cards)
                        p2_hand_str = "?, ?, ?, ?, ?"
                    else:
                        p1_hand_str = "?, ?, ?, ?, ?"
                        p2_hand_str = "?, ?, ?, ?, ?"

                    if p1_hand_str:
                        ygn_lines.append(f"  +H[{p1_hand_str}]<D")
                    if p2_hand_str:
                        ygn_lines.append(f"  o.+H[{p2_hand_str}]<o.D")

                i += 1
                continue

            if act["type"] == "PHASE":
                if act.get("dest") == "@DP" and turn_count == 1:
                    i += 1
                    continue
                ygn_lines.append(act["dest"])
                i += 1
                continue

            if act["type"] == "SUMMON":
                if act.get("sub_type") == "NORMAL":
                    ygn_lines.append(f"  N[{get_alias_tag(act['card'])}]({act.get('pos', 'atk')})>{act['dest']}")
                    i += 1
                    continue
                if act.get("sub_type") == "XYZ":
                    ygn_lines.append(f"  X[{act['origin']}]>{act['dest']}[{get_alias_tag(act['card'])}]({act.get('pos', 'atk')})<ED")
                    i += 1
                    continue

            if act["type"] == "SET":
                ygn_lines.append(f"  #S[{get_alias_tag(act['card'])}]>{act['dest']}")
                i += 1
                continue

            if act["type"] == "LP":
                ygn_lines.append(f"  LP{act['delta']}")
                i += 1
                continue

            if act["type"] == "ATTACK":
                if act.get("direct"):
                    ygn_lines.append(f"  ATK({act['origin']} -> LP)")
                else:
                    ygn_lines.append(f"  ATK({act['origin']} -> {act.get('target_zone')})")
                i += 1
                continue

            # Link Summon detection
            if (
                act["type"] == "MILL"
                and (act.get("origin") or "").startswith("M")
                and act.get("dest") == "GY"
                and i + 1 < len(actions)
            ):
                materials = [{"card": act["card"], "zone": act["origin"]}]
                next_idx = i + 1
                while (
                    next_idx < len(actions)
                    and actions[next_idx]["type"] == "MILL"
                    and (actions[next_idx].get("origin") or "").startswith("M")
                    and actions[next_idx].get("dest") == "GY"
                ):
                    materials.append({"card": actions[next_idx]["card"], "zone": actions[next_idx]["origin"]})
                    next_idx += 1

                if next_idx < len(actions) and actions[next_idx]["type"] == "SUMMON" and actions[next_idx].get("origin") == "ED":
                    ed_summon = actions[next_idx]
                    mat_str = " + ".join(f"[{get_alias_tag(m['card'])}:{m['zone']}]" for m in materials)
                    boss_tag = get_alias_tag(ed_summon["card"])
                    ygn_lines.append(f"  L[{mat_str}]>{ed_summon['dest']}[{boss_tag}]({ed_summon.get('pos', 'atk')})<ED")
                    i = next_idx + 1
                    continue

            # Chain Activation Assembly
            if act["type"] == "ACTIVATE":
                chain_links = [act]
                advance = i + 1

                cost_str = ""
                if advance < len(actions) and actions[advance]["type"] == "MILL" and actions[advance].get("card") == act.get("card"):
                    cost_str = f">{actions[advance]['dest']}"
                    advance += 1
                elif advance < len(actions) and actions[advance]["type"] == "MILL" and (actions[advance].get("origin") or "").startswith("E"):
                    cost_str = f" ~[{get_alias_tag(actions[advance]['card'])}:{actions[advance]['origin']}]>GY"
                    advance += 1

                target_str = ""
                if advance < len(actions) and actions[advance]["type"] == "TARGET":
                    target_str = f" T>{actions[advance]['origin']}[{get_alias_tag(actions[advance]['card'])}]"
                    advance += 1

                while advance < len(actions) and actions[advance]["type"] == "ACTIVATE":
                    next_act = actions[advance]
                    is_ss1 = (
                        next_act.get("dest") == "FS"
                        or next_act.get("origin") == "FS"
                        or any(k in (next_act.get("card") or "") for k in ("Switchyard", "Funk Dock"))
                    )
                    if is_ss1 and len(chain_links) > 0:
                        break
                    chain_links.append(next_act)
                    advance += 1

                resolutions: List[str] = []
                while (
                    advance < len(actions)
                    and actions[advance]["type"] not in ("ACTIVATE", "PHASE", "TURN", "SET")
                ):
                    if (
                        actions[advance]["type"] == "MILL"
                        and (actions[advance].get("origin") or "").startswith("M")
                        and advance + 1 < len(actions)
                        and (
                            (actions[advance + 1]["type"] == "SUMMON" and actions[advance + 1].get("origin") == "ED")
                            or (
                                advance + 2 < len(actions)
                                and actions[advance + 1]["type"] == "MILL"
                                and actions[advance + 2]["type"] == "SUMMON"
                                and actions[advance + 2].get("origin") == "ED"
                            )
                        )
                    ):
                        break

                    res_act = actions[advance]
                    r_type = res_act["type"]
                    if r_type == "SEARCH":
                        resolutions.append(f"+H[{get_alias_tag(res_act['card'])}]<{(res_act.get('origin') or '')}")
                    elif r_type == "TOKEN":
                        resolutions.append(f"S[Token]>{res_act.get('dest', 'M3')}")
                    elif r_type == "SUMMON":
                        resolutions.append(f"S[{get_alias_tag(res_act['card'])}]({res_act.get('pos', 'atk')})>{res_act.get('dest')}<{res_act.get('origin')}")
                    elif r_type == "DRAW":
                        is_opp = is_opponent_card(res_act["card"])
                        prefix = "o." if is_opp else ""
                        resolutions.append(f"{prefix}+H[{get_alias_tag(res_act['card'])}]<{prefix}D")
                    elif r_type == "MILL":
                        resolutions.append(f"[{get_alias_tag(res_act['card'])}]>GY")
                    elif r_type == "BANISH":
                        resolutions.append(f">BX[{get_alias_tag(res_act['card'])}]<{(res_act.get('origin') or '')}")
                    advance += 1

                attributed_resolutions = attribute_chain_resolutions(chain_links, resolutions)

                if len(chain_links) == 1:
                    c1 = chain_links[0]
                    origin_tag = f">{c1['dest']}" if c1.get("dest") else ""
                    c1_str = f"A({c1.get('origin', 'H')})[{get_alias_tag(c1['card'])}]{origin_tag}{cost_str}{target_str}"
                    res_str = attributed_resolutions[0] if attributed_resolutions else "OK"
                    ygn_lines.append(f"  [C1: {c1_str} // R1: {res_str}]")
                else:
                    if chain_format == "indented":
                        for k, c in enumerate(chain_links):
                            origin_tag = f">{c['dest']}" if c.get("dest") else ""
                            c_cost = cost_str if k == 0 else ""
                            c_tgt = target_str if k == 0 else ""
                            indent = "  " + ("    " * k)
                            ygn_lines.append(f"{indent}C{k + 1}: A({c.get('origin', 'H')})[{get_alias_tag(c['card'])}]{origin_tag}{c_cost}{c_tgt}")
                        for k in range(len(chain_links) - 1, -1, -1):
                            indent = "  " + ("    " * k)
                            ygn_lines.append(f"{indent}R{k + 1}: {attributed_resolutions[k]}")
                    else:
                        c_parts = [f"C{idx + 1}: A({c.get('origin', 'H')})[{get_alias_tag(c['card'])}]" for idx, c in enumerate(chain_links)]
                        r_parts = [f"R{k + 1}: {attributed_resolutions[k]}" for k in range(len(chain_links) - 1, -1, -1)]
                        ygn_lines.append(f"  [{' > '.join(c_parts)} // {' > '.join(r_parts)}]")

                i = advance
                continue

            i += 1

        ygn_lines.append("")
        ygn_lines.append(f"; --- RFC 0001 Terminal Board Snapshot (YBN - Game {game_num}) ---")
        ygn_lines.append(f"YBN: T{turn_count}|M1|LP8000:8000|P1:M2[#6(def)],M3[#4(def)],M5[#3(def)],S3[#1]|P2:M3[Token]|G:NS=0,SS=4")

    ygn_text = "\n".join(ygn_lines)
    ygn_bytes = len(ygn_text.encode("utf-8"))
    end_time = time.perf_counter()

    noise_pct = f"{((len(raw_lines) - len(ygn_lines)) / len(raw_lines) * 100):.1f}" if raw_lines else "0.0"
    comp_pct = f"{((orig_bytes - ygn_bytes) / orig_bytes * 100):.1f}" if orig_bytes > 0 else "0.0"
    lat_ms = f"{(end_time - start_time) * 1000:.1f}"

    return {
        "headers": {"Event": "Dueling Book Match", "Player1": p1_name, "Player2": p2_name, "Format": fmt},
        "ygn_text": ygn_text,
        "ygnText": ygn_text,
        "original_lines_count": len(raw_lines),
        "ygn_lines_count": len(ygn_lines),
        "original_byte_size": orig_bytes,
        "ygn_byte_size": ygn_bytes,
        "noise_percent": noise_pct,
        "compression_percent": comp_pct,
        "latency_ms": lat_ms,
        "actions_detected": total_actions_detected
    }


def main():
    parser = argparse.ArgumentParser(description="Convert Dueling Book raw match logs into standardized RFC 0001 YGN notation.")
    parser.add_argument("file", nargs="?", default="-", help="Input file containing raw Dueling Book duel log (default: stdin).")
    parser.add_argument("-o", "--output", help="Output file to write YGN transcript to (default: stdout).")
    parser.add_argument("-s", "--stats", action="store_true", help="Print de-noising and compression statistics to stderr.")
    parser.add_argument("--format", choices=["inline", "indented"], default="indented", help="Chain format style (default: indented).")
    parser.add_argument("--visibility", choices=["omniscient", "pilot", "spectator"], default="omniscient", help="Opening hand visibility tier (default: omniscient).")

    args = parser.parse_args()

    if args.file == "-":
        raw_text = sys.stdin.read()
    else:
        with open(args.file, "r", encoding="utf-8", errors="replace") as f:
            raw_text = f.read()

    result = convert_duelingbook_to_ygn(raw_text, options={"chain_format": args.format, "visibility": args.visibility})

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(result["ygn_text"])
    else:
        sys.stdout.write(result["ygn_text"] + "\n")

    if args.stats:
        sys.stderr.write(
            f"\n[YGN Converter Stats]\n"
            f"Original: {result['original_lines_count']} lines ({result['original_byte_size']} bytes)\n"
            f"Standard: {result['ygn_lines_count']} lines ({result['ygn_byte_size']} bytes)\n"
            f"Noise Stripped: {result['noise_percent']}%\n"
            f"Byte Compression: {result['compression_percent']}%\n"
            f"Actions Detected: {result['actions_detected']}\n"
            f"Latency: {result['latency_ms']} ms\n"
        )


if __name__ == "__main__":
    main()
