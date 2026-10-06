"""
Official Python Dataclass AST Definitions for YGN (Yu-Gi-Oh! Game Notation) - RFC 0001
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional, Literal

ZoneCoordinate = str
ActionOperator = str
PhaseName = Literal["@DP", "@SP", "@M1", "@BP", "@M2", "@EP"]
QualityGlyph = Literal["!", "!!", "?", "??", "!?", "?!"]
VisibilityScope = Literal["spectator", "pilot_p1", "pilot_p2", "omniscient"]

@dataclass
class CardToken:
    alias: Optional[str] = None
    name: Optional[str] = None
    passcode: Optional[int] = None
    is_hidden: bool = False

@dataclass
class YgnSingleAction:
    operator: str
    card: CardToken
    action_type: str = "single"
    position: Optional[Literal["atk", "def"]] = None
    zone: Optional[str] = None
    origin_zone: Optional[str] = None
    target_zone: Optional[str] = None
    lp_delta: Optional[int] = None
    verified_lp: Optional[int] = None
    raw_text: str = ""

@dataclass
class YgnChainLink:
    link_number: int
    action: YgnSingleAction

@dataclass
class YgnChainResolution:
    link_number: int
    resolution_text: str

@dataclass
class YgnChainBlock:
    declarations: List[YgnChainLink] = field(default_factory=list)
    resolutions: List[YgnChainResolution] = field(default_factory=list)
    action_type: str = "chain"
    glyph: Optional[str] = None
    raw_text: str = ""

YgnActionLine = YgnSingleAction | YgnChainBlock

@dataclass
class YgnPhase:
    phase: str
    actions: List[YgnActionLine] = field(default_factory=list)

@dataclass
class YgnTurn:
    turn_number: int
    turn_player: str
    opponent: str
    phases: List[YgnPhase] = field(default_factory=list)
    keyframe_ybn: Optional[str] = None

@dataclass
class YgnDocument:
    headers: Dict[str, str] = field(default_factory=dict)
    deck1_aliases: Dict[str, Dict[str, any]] = field(default_factory=dict)
    deck2_aliases: Dict[str, Dict[str, any]] = field(default_factory=dict)
    turns: List[YgnTurn] = field(default_factory=list)
    raw_text: str = ""

@dataclass
class YbnSnapshot:
    turn_player: str
    phase: str
    p1_lp: int
    p2_lp: int
    p1_board: List[str] = field(default_factory=list)
    p2_board: List[str] = field(default_factory=list)
    p1_hand_count: int = 0
    p2_hand_count: int = 0
    chain_state: int = 0

