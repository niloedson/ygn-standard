/**
 * Reference Converter: Dueling Book Raw Clickstream -> YGN v1.1
 * Part of YGN-Standard RFC 0001
 */

export interface DuelingBookConversionResult {
  headers: Record<string, string>;
  ygnText: string;
  originalLinesCount: number;
  ygnLinesCount: number;
  originalByteSize: number;
  ygnByteSize: number;
  compressionPercent: number;
  actionsDetected: number;
}

const NOISE_PATTERNS = [
  /Signaled OK/i,
  /Viewed deck/i,
  /Stopped viewing Deck/i,
  /Shuffled deck/i,
  /Viewed Extra Deck/i,
  /Stopped viewing Extra Deck/i,
  /Viewed GY/i,
  /Stopped viewing GY/i,
  /Viewed Opponent's/i,
  /Stopped viewing Opponent's/i,
  /Shuffled hand/i,
  /Thinking/i,
  /Chose to go first/i,
  /glhf/i
];

function isNoiseLine(line: string): boolean {
  return NOISE_PATTERNS.some((pattern) => pattern.test(line));
}

function normalizeZone(zoneStr: string): string {
  const z = zoneStr.trim();
  if (z === "Right EMZ" || z === "Right Extra Monster Zone") return "ER";
  if (z === "Left EMZ" || z === "Left Extra Monster Zone") return "EL";
  if (z === "Field Spell Zone") return "FS";
  if (z.startsWith("M-")) return `M${z.slice(2)}`;
  if (z.startsWith("S-")) return `S${z.slice(2)}`;
  if (z.startsWith("hand")) return "H";
  return z;
}

export function convertDuelingBookToYgn(rawLogText: string): DuelingBookConversionResult {
  const rawLines = rawLogText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const headers: Record<string, string> = {
    Format: "TCG Advanced",
    Site: "Dueling Book"
  };

  const ygnOutputLines: string[] = [];
  let p1Name = "Player 1";
  let p2Name = "Player 2";
  let currentTurn = 0;
  let currentPhase = "@M1";
  let activeTurnPlayer = "";
  let actionCount = 0;

  // 1. Extract Host & Player Info from Header Lines
  for (let i = 0; i < Math.min(rawLines.length, 10); i++) {
    const l = rawLines[i];
    const hostMatch = l.match(/\[\d+:\d+\]\s+([A-Z0-9_\-\s]+)\s+hosted\s+(?:2 out of 3|1 out of 1)\s+Match\s+in\s+([A-Za-z0-9_\-\s()]+)/i);
    if (hostMatch) {
      p1Name = hostMatch[1].trim();
      headers["Format"] = hostMatch[2].trim();
    }
    const acceptMatch = l.match(/Accepted\s+([A-Za-z0-9_\-\s]+)\s+into duel/i);
    if (acceptMatch) {
      p2Name = acceptMatch[1].trim();
    }
  }

  ygnOutputLines.push(`[Event "Dueling Book Match"]`);
  ygnOutputLines.push(`[Player1 "${p1Name}" 8000]`);
  ygnOutputLines.push(`[Player2 "${p2Name}" 8000]`);
  ygnOutputLines.push(`[Format "${headers["Format"]}"]`);
  ygnOutputLines.push("");

  // 2. Process Game Action Lines
  let pendingActions: string[] = [];

  const flushPhase = () => {
    if (pendingActions.length > 0) {
      ygnOutputLines.push(currentPhase);
      for (const act of pendingActions) {
        ygnOutputLines.push(`  ${act}`);
      }
      pendingActions = [];
    }
  };

  for (const line of rawLines) {
    // Detect Turn Delimiters
    const turnMatch = line.match(/----------------\(Turn\s+(\d+)\)----------------/i);
    if (turnMatch) {
      flushPhase();
      currentTurn = parseInt(turnMatch[1], 10);
      activeTurnPlayer = currentTurn % 2 === 1 ? p1Name : p2Name;
      ygnOutputLines.push(`T${currentTurn}: ${activeTurnPlayer}`);
      currentPhase = "@M1";
      continue;
    }

    // Skip Noise
    if (isNoiseLine(line)) {
      continue;
    }

    // Phase Transitions
    if (/Entered Standby Phase/i.test(line)) {
      flushPhase();
      currentPhase = "@SP";
      continue;
    }
    if (/Entered Main Phase 1/i.test(line)) {
      flushPhase();
      currentPhase = "@M1";
      continue;
    }
    if (/Entered Battle Phase/i.test(line)) {
      flushPhase();
      currentPhase = "@BP";
      continue;
    }
    if (/Entered Main Phase 2/i.test(line)) {
      flushPhase();
      currentPhase = "@M2";
      continue;
    }
    if (/Entered End Phase/i.test(line)) {
      flushPhase();
      currentPhase = "@EP";
      continue;
    }

    // Strip Timestamp [M:SS]
    const content = line.replace(/^\[\d+:\d+\]\s*/, "").trim();

    // Normal Summon: Normal Summoned X from Y to Z
    const nsMatch = content.match(/Normal Summoned\s+(.+?)\s+from\s+(.+?)\s+to\s+(.+)/i);
    if (nsMatch) {
      const card = nsMatch[1].trim();
      const zone = normalizeZone(nsMatch[3]);
      pendingActions.push(`N[${card}]>${zone}`);
      actionCount++;
      continue;
    }

    // Special Summon: Special Summoned X from Origin to Zone (POS)
    const ssMatch = content.match(/Special Summoned\s+(.+?)\s+from\s+(.+?)\s+to\s+([^(]+)(?:\s+\((ATK|DEF)\))?/i);
    if (ssMatch) {
      const card = ssMatch[1].trim();
      const origin = normalizeZone(ssMatch[2]);
      const zone = normalizeZone(ssMatch[3]);
      const pos = ssMatch[4] ? `(${ssMatch[4].toLowerCase()})` : "";
      pendingActions.push(`S[${card}]${pos}>${zone}<${origin}`);
      actionCount++;
      continue;
    }

    // Activation: Activated [Field Spell] X from Y to Z
    const actMatch = content.match(/Activated\s+(?:Field Spell\s+)?(.+?)\s+from\s+(.+?)\s+to\s+(.+)/i);
    if (actMatch) {
      const card = actMatch[1].trim();
      const zone = normalizeZone(actMatch[3]);
      pendingActions.push(`[C1: A(${zone})[${card}]]`);
      actionCount++;
      continue;
    }

    // Declared Effect: Declared effect of X in/from Y
    const declMatch = content.match(/Declared effect of\s+(.+?)\s+(?:in|from)\s+(.+)/i);
    if (declMatch) {
      const card = declMatch[1].trim();
      const zone = normalizeZone(declMatch[2]);
      pendingActions.push(`A(${zone})[${card}]`);
      actionCount++;
      continue;
    }

    // Pointed / Targeted: Pointed at X from/in Y
    const pointMatch = content.match(/Pointed at\s+(.+?)\s+(?:from|in)\s+(.+)/i);
    if (pointMatch) {
      const card = pointMatch[1].trim();
      const zone = normalizeZone(pointMatch[2]);
      pendingActions.push(`T>${zone}[${card}]`);
      actionCount++;
      continue;
    }

    // Added to Hand: Added X from Deck to hand
    const addMatch = content.match(/Added\s+(.+?)\s+from\s+(.+?)\s+to hand/i);
    if (addMatch) {
      const card = addMatch[1].trim();
      const origin = normalizeZone(addMatch[2]);
      pendingActions.push(`+H[${card}]<${origin}`);
      actionCount++;
      continue;
    }

    // Placed on Field: Placed X from Origin to Zone
    const placedMatch = content.match(/Placed\s+(.+?)\s+from\s+(.+?)\s+to\s+(.+)/i);
    if (placedMatch) {
      const card = placedMatch[1].trim();
      const origin = normalizeZone(placedMatch[2]);
      const zone = normalizeZone(placedMatch[3]);
      pendingActions.push(`[${card}]>${zone}<${origin}`);
      actionCount++;
      continue;
    }

    // Xyz Overlay: Overlayed A in ZoneA onto B in ZoneB
    const xyzMatch = content.match(/Overlayed\s+(.+?)\s+in\s+(.+?)\s+onto\s+(.+?)\s+in\s+(.+)/i);
    if (xyzMatch) {
      const matA = xyzMatch[1].trim();
      const matB = xyzMatch[3].trim();
      const zoneB = normalizeZone(xyzMatch[4]);
      pendingActions.push(`X[${matA}+${matB}]>${zoneB}`);
      actionCount++;
      continue;
    }

    // Detached: Detached Xyz Material A from B in Zone
    const detachMatch = content.match(/Detached Xyz Material\s+(.+?)\s+from\s+(.+?)\s+in\s+(.+)/i);
    if (detachMatch) {
      const mat = detachMatch[1].trim();
      const zone = normalizeZone(detachMatch[3]);
      pendingActions.push(`!${zone}[${mat}]>GY`);
      actionCount++;
      continue;
    }

    // Sent from Zone to Zone: Sent X from A to B
    const sentMatch = content.match(/Sent\s+(.+?)\s+from\s+(.+?)\s+to\s+(.+)/i);
    if (sentMatch) {
      const card = sentMatch[1].trim();
      const dest = normalizeZone(sentMatch[3]);
      pendingActions.push(`[${card}]>${dest}`);
      actionCount++;
      continue;
    }

    // LP Change: Lost/Gained X LP
    const lpMatch = content.match(/(Lost|Gained)\s+(\d+)\s+LP/i);
    if (lpMatch) {
      const op = lpMatch[1].toLowerCase() === "lost" ? "-" : "+";
      const amt = lpMatch[2];
      pendingActions.push(`LP${op}${amt}`);
      actionCount++;
      continue;
    }

    // In-game Chat Messages: "[Text]"
    if (content.startsWith('"') && content.endsWith('"')) {
      const chat = content.slice(1, -1).trim();
      // Keep meaningful dispute chat messages
      if (chat.length > 0 && !chat.includes("glhf")) {
        pendingActions.push(`// Chat: "${chat}"`);
      }
      continue;
    }
  }

  flushPhase();

  const ygnText = ygnOutputLines.join("\n");
  const origBytes = Buffer.byteLength(rawLogText, "utf-8");
  const ygnBytes = Buffer.byteLength(ygnText, "utf-8");
  const compressionPercent = Number((((origBytes - ygnBytes) / (origBytes || 1)) * 100).toFixed(1));

  return {
    headers,
    ygnText,
    originalLinesCount: rawLines.length,
    ygnLinesCount: ygnOutputLines.length,
    originalByteSize: origBytes,
    ygnByteSize: ygnBytes,
    compressionPercent,
    actionsDetected: actionCount
  };
}
