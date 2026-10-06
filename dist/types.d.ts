/**
 * Official TypeScript AST Definitions for YGN (Yu-Gi-Oh! Game Notation)
 * and YBN (Yu-Gi-Oh! Board Notation) - RFC 0001
 */
export type ZoneCoordinate = "M1" | "M2" | "M3" | "M4" | "M5" | "S1" | "S2" | "S3" | "S4" | "S5" | "EL" | "ER" | "FS" | "H" | "D" | "ED" | "GY" | "BX" | "BF" | `o.${"M1" | "M2" | "M3" | "M4" | "M5"}` | `o.${"S1" | "S2" | "S3" | "S4" | "S5"}` | `o.${"FS" | "H" | "D" | "ED" | "GY" | "BX" | "BF"}`;
export type ActionOperator = "N" | "#N" | "S" | "A" | "#S" | ">" | "<" | "+" | "!" | "X" | "L" | "F" | "Y" | "R" | "@" | "T" | "$" | "LP";
export type PhaseName = "@DP" | "@SP" | "@M1" | "@BP" | "@M2" | "@EP";
export type QualityGlyph = "!" | "!!" | "?" | "??" | "!?" | "?!";
export type VisibilityScope = "spectator" | "pilot_p1" | "pilot_p2" | "omniscient";
export interface CardToken {
    alias?: string;
    name?: string;
    passcode?: number;
    isHidden?: boolean;
}
export interface YgnSingleAction {
    type: "single";
    operator: ActionOperator;
    card: CardToken;
    position?: "atk" | "def";
    zone?: ZoneCoordinate;
    originZone?: ZoneCoordinate;
    targetZone?: ZoneCoordinate;
    lpDelta?: number;
    verifiedLp?: number;
    rawText: string;
}
export interface YgnChainLink {
    linkNumber: number;
    action: YgnSingleAction;
}
export interface YgnChainResolution {
    linkNumber: number;
    resolutionText: string;
}
export interface YgnChainBlock {
    type: "chain";
    declarations: YgnChainLink[];
    resolutions: YgnChainResolution[];
    glyph?: QualityGlyph;
    rawText: string;
}
export type YgnActionLine = YgnSingleAction | YgnChainBlock;
export interface YgnPhase {
    phase: PhaseName;
    actions: YgnActionLine[];
}
export interface YgnTurn {
    turnNumber: number;
    turnPlayer: string;
    opponent: string;
    keyframeYbn?: string;
    phases: YgnPhase[];
}
export interface YgnDocument {
    headers: Record<string, string>;
    deck1Aliases: Record<string, {
        passcode?: number;
        name: string;
    }>;
    deck2Aliases: Record<string, {
        passcode?: number;
        name: string;
    }>;
    turns: YgnTurn[];
    rawText: string;
}
export interface YbnSnapshot {
    turnPlayer: "P1" | "P2";
    phase: "DP" | "SP" | "M1" | "BP" | "M2" | "EP";
    p1Lp: number;
    p2Lp: number;
    p1Board: string[];
    p2Board: string[];
    p1HandCount: number;
    p2HandCount: number;
    chainState: number;
}
