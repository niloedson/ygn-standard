/**
 * Reference Lexer & AST Parser for YGN v1.1
 * Part of YGN-Standard RFC 0001
 */

import type {
  ActionOperator,
  CardToken,
  PhaseName,
  QualityGlyph,
  YgnActionLine,
  YgnChainBlock,
  YgnDocument,
  YgnPhase,
  YgnSingleAction,
  YgnTurn,
  ZoneCoordinate
} from "./types.js";

const VALID_ZONES = new Set([
  "M1", "M2", "M3", "M4", "M5",
  "S1", "S2", "S3", "S4", "S5",
  "EL", "ER", "FS", "H", "D", "ED", "GY", "BX", "BF",
  "o.M1", "o.M2", "o.M3", "o.M4", "o.M5",
  "o.S1", "o.S2", "o.S3", "o.S4", "o.S5",
  "o.FS", "o.H", "o.D", "o.ED", "o.GY", "o.BX", "o.BF"
]);

export function parseYgn(text: string): YgnDocument {
  const lines = text.split(/\r?\n/);
  const headers: Record<string, string> = {};
  const deck1Aliases: Record<string, { passcode?: number; name: string }> = {};
  const deck2Aliases: Record<string, { passcode?: number; name: string }> = {};
  const turns: YgnTurn[] = [];

  let currentTurn: YgnTurn | null = null;
  let currentPhase: YgnPhase | null = null;
  let inDeck1Aliases = false;
  let inDeck2Aliases = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Header Tags: [TagName "TagValue"]
    const tagMatch = line.match(/^\[([A-Za-z0-9_]+)\s+"([^"]*)"\]$/);
    if (tagMatch) {
      headers[tagMatch[1]] = tagMatch[2];
      continue;
    }

    // Alias Blocks
    if (line === "[Deck1_Aliases]") {
      inDeck1Aliases = true;
      inDeck2Aliases = false;
      continue;
    }
    if (line === "[Deck2_Aliases]") {
      inDeck1Aliases = false;
      inDeck2Aliases = true;
      continue;
    }

    if (inDeck1Aliases || inDeck2Aliases) {
      if (line.startsWith("[")) {
        inDeck1Aliases = false;
        inDeck2Aliases = false;
      } else {
        const aliasMatch = line.match(/^([a-z0-9#]+):(?:(\d+):)?(.+)$/i);
        if (aliasMatch) {
          const key = aliasMatch[1];
          const pass = aliasMatch[2] ? parseInt(aliasMatch[2], 10) : undefined;
          const name = aliasMatch[3].trim();
          if (inDeck1Aliases) deck1Aliases[key] = { passcode: pass, name };
          else deck2Aliases[key] = { passcode: pass, name };
          continue;
        }
      }
    }

    // Turn Marker: T1: Player vs Player
    const turnMatch = line.match(/^T(\d+):\s*([^\s]+)(?:\s+(?:vs|\(.*\))\s+(.+))?/i);
    if (turnMatch) {
      const turnNum = parseInt(turnMatch[1], 10);
      const p1 = turnMatch[2].trim();
      const p2 = turnMatch[3] ? turnMatch[3].trim() : (turnNum % 2 === 1 ? headers["Player2"] : headers["Player1"]) || "Opponent";

      currentTurn = {
        turnNumber: turnNum,
        turnPlayer: p1,
        opponent: p2,
        phases: []
      };
      turns.push(currentTurn);
      currentPhase = null;
      continue;
    }

    // Phase Marker: @DP, @SP, @M1, @BP, @M2, @EP
    if (line.startsWith("@")) {
      const phaseStr = line.toUpperCase() as PhaseName;
      currentPhase = {
        phase: phaseStr,
        actions: []
      };
      if (currentTurn) {
        currentTurn.phases.push(currentPhase);
      }
      continue;
    }

    // Parse Action Line
    if (currentPhase) {
      const parsedAction = parseActionLine(line);
      if (parsedAction) {
        currentPhase.actions.push(parsedAction);
      }
    }
  }

  return {
    headers,
    deck1Aliases,
    deck2Aliases,
    turns,
    rawText: text
  };
}

function parseActionLine(line: string): YgnActionLine | null {
  // Check if Chain Block: [C1: ... // R1: ...]
  if (line.startsWith("[C") && line.includes("//")) {
    const glyphMatch = line.match(/\](!|!!|\?|\?\?|!\?|\?!)$/);
    const glyph = glyphMatch ? (glyphMatch[1] as QualityGlyph) : undefined;
    const inner = line.replace(/^\[/, "").replace(/\](?:\S+)?$/, "");
    const [declPart, resPart] = inner.split("//").map((s) => s.trim());

    const decls = declPart.split(/>(?=\s*C\d+:)/).map((chunk) => {
      const m = chunk.trim().match(/^C(\d+):\s*(.+)$/);
      return {
        linkNumber: m ? parseInt(m[1], 10) : 1,
        action: parseSingleAction(m ? m[2] : chunk.trim())
      };
    });

    const resols = resPart.split(/>(?=\s*R\d+:)/).map((chunk) => {
      const m = chunk.trim().match(/^R(\d+):\s*(.+)$/);
      return {
        linkNumber: m ? parseInt(m[1], 10) : 1,
        resolutionText: m ? m[2].trim() : chunk.trim()
      };
    });

    return {
      type: "chain",
      declarations: decls,
      resolutions: resols,
      glyph,
      rawText: line
    };
  }

  return parseSingleAction(line);
}

function parseSingleAction(actionText: string): YgnSingleAction {
  let operator: ActionOperator = "A";
  let card: CardToken = {};
  let position: "atk" | "def" | undefined;
  let zone: ZoneCoordinate | undefined;
  let originZone: ZoneCoordinate | undefined;
  let targetZone: ZoneCoordinate | undefined;

  // Extract operator
  if (actionText.startsWith("N")) operator = "N";
  else if (actionText.startsWith("#N")) operator = "#N";
  else if (actionText.startsWith("S")) operator = "S";
  else if (actionText.startsWith("A")) operator = "A";
  else if (actionText.startsWith("#S")) operator = "#S";
  else if (actionText.startsWith("+H")) operator = "+";
  else if (actionText.startsWith("!")) operator = "!";
  else if (actionText.startsWith("X")) operator = "X";
  else if (actionText.startsWith("L")) operator = "L";
  else if (actionText.startsWith("F")) operator = "F";
  else if (actionText.startsWith("Y")) operator = "Y";
  else if (actionText.startsWith("R")) operator = "R";
  else if (actionText.startsWith("LP")) operator = "LP";

  // Extract card token [Name] or [#Alias:Name]
  const cardMatch = actionText.match(/\[(?:([a-z0-9#]+):)?([^\]]+)\]/i);
  if (cardMatch) {
    card = {
      alias: cardMatch[1],
      name: cardMatch[2]
    };
  }

  // Extract Position (atk) or (def)
  if (actionText.includes("(atk)")) position = "atk";
  else if (actionText.includes("(def)")) position = "def";

  // Extract Destination >Zone
  const destMatch = actionText.match(/>(o\.[A-Za-z0-9]+|[A-Za-z0-9]+)/);
  if (destMatch && VALID_ZONES.has(destMatch[1])) {
    zone = destMatch[1] as ZoneCoordinate;
  }

  // Extract Origin <Zone
  const origMatch = actionText.match(/<(o\.[A-Za-z0-9]+|[A-Za-z0-9]+)/);
  if (origMatch && VALID_ZONES.has(origMatch[1])) {
    originZone = origMatch[1] as ZoneCoordinate;
  }

  // Extract Target T>Zone
  const targMatch = actionText.match(/T>(o\.[A-Za-z0-9]+|[A-Za-z0-9]+)/);
  if (targMatch && VALID_ZONES.has(targMatch[1])) {
    targetZone = targMatch[1] as ZoneCoordinate;
  }

  return {
    type: "single",
    operator,
    card,
    position,
    zone,
    originZone,
    targetZone,
    rawText: actionText
  };
}
