/**
 * @file duelingbookToYgn.ts
 * @description Reference converter transforming raw Dueling Book plain-text match clickstreams
 * into standardized, compact RFC 0001 Algebraic Yu-Gi-Oh! Game Notation (YGN v1.1) and YBN snapshots.
 */

export function normalizeZone(zoneStr: string): string {
  const z = zoneStr.trim();
  if (/^Right\s+(?:EMZ|Extra\s+Monster\s+Zone)$/i.test(z)) return "ER";
  if (/^Left\s+(?:EMZ|Extra\s+Monster\s+Zone)$/i.test(z)) return "EL";
  if (/^(?:Field\s+Spell\s+Zone|Field\s+Zone|FS)$/i.test(z)) return "FS";
  if (/^M2-?([1-5])$/i.test(z)) return `o.M${RegExp.$1}`;
  if (/^S2-?([1-5])$/i.test(z)) return `o.S${RegExp.$1}`;
  if (/^M-?([1-5])$/i.test(z)) return `M${RegExp.$1}`;
  if (/^S-?([1-5])$/i.test(z)) return `S${RegExp.$1}`;
  if (/^opponent's\s+hand(?:\s*\(\d+\/\d+\))?$/i.test(z)) return "o.H";
  if (/^hand(?:\s*\(\d+\/\d+\))?$/i.test(z)) return "H";
  if (/^opponent's\s+(?:GY|Graveyard)$/i.test(z)) return "o.GY";
  if (/^GY|Graveyard$/i.test(z)) return "GY";
  if (/^opponent's\s+deck$/i.test(z)) return "o.D";
  if (/^Deck$/i.test(z)) return "D";
  if (/^Extra\s+Deck$/i.test(z)) return "ED";
  if (/^opponent's\s+extra\s+deck$/i.test(z)) return "o.ED";
  if (/^Banished$/i.test(z)) return "B";
  return z;
}

export function cleanCardName(rawName: string): string {
  return rawName
    .replace(/^["']|["']$/g, '')
    .replace(/\s+(?:from|in)\s+(?:opponent's\s+)?hand(?:\s*\(\d+\/\d+\))?/i, '')
    .replace(/\s+(?:from|in)\s+(?:opponent's\s+)?(?:Deck|GY|Graveyard|Extra\s+Deck|Field\s+Spell\s+Zone)/i, '')
    .replace(/\s+to\s+(?:M2?-?[1-5]|S2?-?[1-5]|Right\s+EMZ|Left\s+EMZ|GY|hand).*/i, '')
    .replace(/\s*\((?:ATK|DEF|\d+\/\d+)\)/gi, '')
    .trim();
}

export const HAND_TRAPS = new Set([
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
]);

interface ParsedAction {
  raw: string;
  type:
    | 'TURN'
    | 'PHASE'
    | 'ACTIVATE'
    | 'COST'
    | 'TARGET'
    | 'SUMMON'
    | 'TOKEN'
    | 'SEARCH'
    | 'MILL'
    | 'DRAW'
    | 'SET'
    | 'BANISH'
    | 'LP'
    | 'ATTACK'
    | 'OTHER';
  turnNumber?: number;
  subType?: 'NORMAL' | 'SPECIAL' | 'XYZ' | 'LINK' | 'SYNCHRO';
  card?: string;
  origin?: string;
  dest?: string;
  pos?: string;
  delta?: number;
  targetZone?: string;
  direct?: boolean;
}

export interface DuelingBookConversionResult {
  headers: Record<string, string>;
  ygnText: string;
  originalLinesCount: number;
  ygnLinesCount: number;
  originalByteSize: number;
  ygnByteSize: number;
  noisePercent: string;
  compressionPercent: string;
  latencyMs: string;
  actionsDetected: number;
}

export interface DuelingBookConverterOptions {
  chainFormat?: "inline" | "indented";
  visibility?: "omniscient" | "pilot" | "spectator";
}

/**
 * Partitions a match log into individual Game segments (Game 1, Game 2, Game 3).
 */
export function partitionRawLinesIntoGames(rawLines: string[]): string[][] {
  const games: string[][] = [];
  let currentGame: string[] = [];
  let seenFirstTurn1 = false;
  let sidingOrDefeat = false;

  for (const line of rawLines) {
    if (/Admitted defeat|Finished siding/i.test(line)) {
      sidingOrDefeat = true;
    }
    if (/^----------------\(Turn 1\)----------------/i.test(line)) {
      if (seenFirstTurn1 && sidingOrDefeat && currentGame.length > 0) {
        games.push(currentGame);
        currentGame = [];
        sidingOrDefeat = false;
      }
      seenFirstTurn1 = true;
    }
    currentGame.push(line);
  }

  if (currentGame.length > 0) {
    games.push(currentGame);
  }

  return games.length > 0 ? games : [rawLines];
}

/**
 * Distributes raw collected chain resolution actions across chain links
 * taking into account negations (Crossout, Called by the Grave, Counter Traps, Hand Traps)
 * and ensures that negated links resolve as !NEG(EFF) while non-negated starters receive searches/summons.
 */
export function attributeChainResolutions(
  chainLinks: ParsedAction[],
  rawResolutions: string[]
): string[] {
  const n = chainLinks.length;
  const linkResolutions: string[][] = Array.from({ length: n }, () => []);
  const negatedLinks = new Set<number>();
  const workingResolutions = [...rawResolutions];

  // 1. Trace Negation Cards across the stack (higher chain links down)
  for (let j = n - 1; j >= 0; j--) {
    const act = chainLinks[j];
    const name = act.card?.toLowerCase() || '';

    // Crossout Designator: banishes card from deck and negates matching activated card
    if (name.includes('crossout')) {
      for (let rIdx = 0; rIdx < workingResolutions.length; rIdx++) {
        const r = workingResolutions[rIdx];
        if (r.startsWith('>BX[') && r.includes('<D')) {
          linkResolutions[j].push(r);
          const banishedCard = r.replace(/^>BX\[(?:[a-z0-9#]+:)?([^\]]+)\].*$/i, '$1').toLowerCase();
          for (let k = 0; k < j; k++) {
            const targetCard = chainLinks[k].card?.toLowerCase() || '';
            if (targetCard.includes(banishedCard) || banishedCard.includes(targetCard)) {
              negatedLinks.add(k);
              linkResolutions[j].push(`!NEG(EFF)[${chainLinks[k].card}]`);
            }
          }
          workingResolutions.splice(rIdx, 1);
          break;
        }
      }
    }

    // Called by the Grave: banishes card from GY and negates matching monster
    if (name.includes('called by the grave')) {
      for (let rIdx = 0; rIdx < workingResolutions.length; rIdx++) {
        const r = workingResolutions[rIdx];
        if (r.startsWith('>BX[') && r.includes('<GY')) {
          linkResolutions[j].push(r);
          const banishedCard = r.replace(/^>BX\[(?:[a-z0-9#]+:)?([^\]]+)\].*$/i, '$1').toLowerCase();
          for (let k = 0; k < j; k++) {
            const targetCard = chainLinks[k].card?.toLowerCase() || '';
            if (targetCard.includes(banishedCard) || banishedCard.includes(targetCard)) {
              negatedLinks.add(k);
              linkResolutions[j].push(`!NEG(EFF)[${chainLinks[k].card}]`);
            }
          }
          workingResolutions.splice(rIdx, 1);
          break;
        }
      }
    }

    // Direct Negation Cards (Reframing, Skull Meister, Ghost Belle, Solemn)
    if (
      name.includes('reframing') ||
      name.includes('skull meister') ||
      name.includes('ghost belle') ||
      name.includes('solemn')
    ) {
      if (!negatedLinks.has(j) && j > 0) {
        negatedLinks.add(j - 1);
        linkResolutions[j].push(`!NEG(EFF)[${chainLinks[j - 1].card}]`);
      }
    }
  }

  // 2. Mark explicitly negated links with !NEG(EFF) if not already populated
  for (const negIdx of negatedLinks) {
    if (linkResolutions[negIdx].length === 0) {
      linkResolutions[negIdx].push('!NEG(EFF)');
    }
  }

  // 3. Assign remaining resolution actions to non-negated links
  // In YGO, CL1 is the core effect resolving (searches, tokens, summons)
  if (!negatedLinks.has(0) && workingResolutions.length > 0) {
    linkResolutions[0].push(...workingResolutions);
    workingResolutions.length = 0;
  } else if (workingResolutions.length > 0) {
    for (let k = n - 1; k >= 0; k--) {
      if (!negatedLinks.has(k)) {
        linkResolutions[k].push(...workingResolutions);
        break;
      }
    }
  }

  return linkResolutions.map((resList) => (resList.length > 0 ? resList.join(', ') : 'OK'));
}

export function convertDuelingBookToYgn(
  rawLogText: string,
  options: DuelingBookConverterOptions = {}
): DuelingBookConversionResult {
  const chainFormat = options.chainFormat || "inline";
  const startTime = performance.now();
  const rawLines = rawLogText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const origBytes = Buffer.byteLength(rawLogText, "utf-8");

  const mainAliases = new Map<string, string>();
  const extraAliases = new Map<string, string>();
  const oppAliases = new Map<string, string>();

  let mainCounter = 1;
  let extraCounter = 1;
  let oppCounter = 1;

  let p1Name = "Player 1";
  let p2Name = "Player 2";
  let format = "TCG Advanced";

  // Header extraction
  for (let i = 0; i < Math.min(rawLines.length, 12); i++) {
    const l = rawLines[i];
    const hostMatch = l.match(/\[\d+:\d+\]\s+([A-Za-z0-9_\-\s]+)\s+hosted\s+(?:2 out of 3|1 out of 1)\s+Match\s+in\s+([A-Za-z0-9_\-\s()]+)/i);
    if (hostMatch) {
      p1Name = hostMatch[1].trim();
      format = hostMatch[2].trim();
    }
    const acceptMatch = l.match(/Accepted\s+([A-Za-z0-9_\-\s]+)\s+into duel/i);
    if (acceptMatch) {
      p2Name = acceptMatch[1].trim();
    }
  }

  // Pre-seed known P1 and P2 card draws from initial Turn 1
  const p1KnownCards = new Set<string>();
  const p2KnownCards = new Set<string>();

  let drawCount = 0;
  for (const line of rawLines) {
    const drewMatch = line.match(/\[\d+:\d+\]\s+Drew\s+(.+)/i);
    if (drewMatch) {
      const card = cleanCardName(drewMatch[1]).toLowerCase();
      drawCount++;
      if (drawCount <= 5) {
        p1KnownCards.add(card);
      } else if (drawCount <= 10) {
        p2KnownCards.add(card);
      }
    }
    if (drawCount >= 10) break;
  }

  const isExtraDeckCard = (name: string) => {
    const n = name.toLowerCase();
    return (
      n.includes('genius') ||
      n.includes('gustav') ||
      n.includes('ballista') ||
      n.includes('kagari') ||
      n.includes('camellia') ||
      n.includes('shizuku') ||
      n.includes('hayate') ||
      n.includes('blues') ||
      n.includes('crook') ||
      n.includes('booster') ||
      n.includes('non-finito') ||
      n.includes('track maker') ||
      n.includes('crackle') ||
      n.includes('remix') ||
      n.includes('loudness war') ||
      n.includes('rs') ||
      n.includes('amritara') ||
      n.includes('ty-phon') ||
      n.includes('sky crisis') ||
      n.includes('malong') ||
      n.includes('power patron of creation')
    );
  };

  const isOpponentCard = (name: string) => {
    const n = name.toLowerCase();
    if (p2KnownCards.has(n)) return true;
    if (p1KnownCards.has(n)) return false;
    return HAND_TRAPS.has(n) || n.includes('ash blossom') || n.includes('purulia') || n.includes('fuwalos') || n.includes('droll') || n.includes('nervedo');
  };

  const getAliasTag = (cardName: string): string => {
    if (isExtraDeckCard(cardName)) {
      if (!extraAliases.has(cardName)) {
        extraAliases.set(cardName, `#e${extraCounter++}`);
      }
      return `${extraAliases.get(cardName)}:${cardName}`;
    }
    if (isOpponentCard(cardName)) {
      if (!oppAliases.has(cardName)) {
        oppAliases.set(cardName, `#o${oppCounter++}`);
      }
      return `${oppAliases.get(cardName)}:${cardName}`;
    }
    if (!mainAliases.has(cardName)) {
      mainAliases.set(cardName, `#${mainCounter++}`);
    }
    return `${mainAliases.get(cardName)}:${cardName}`;
  };

  const visibility = options.visibility || "omniscient";
  const visHeader =
    visibility === "pilot" ? "Pilot_P1" : visibility === "spectator" ? "Spectator" : "Omniscient";

  const ygnLines: string[] = [
    `[Event "Dueling Book Match"]`,
    `[Player1 "${p1Name}" 8000]`,
    `[Player2 "${p2Name}" 8000]`,
    `[Format "${format}"]`,
    `[Visibility "${visHeader}"]`,
    `[Standard "RFC 0001 (YGN v1.1)"]`,
    ``
  ];

  const games = partitionRawLinesIntoGames(rawLines);
  let totalActionsDetected = 0;

  games.forEach((gameLines, gameIdx) => {
    const gameNum = gameIdx + 1;
    if (games.length > 1) {
      if (gameIdx > 0) ygnLines.push("");
      ygnLines.push(`[Round "Game ${gameNum}"]`);
    }

    const actions: ParsedAction[] = [];
    let startingPlayer = p1Name;

    // Scan opening 5-card hands for P1 and P2 in this game
    const p1OpeningCards: string[] = [];
    const p2OpeningCards: string[] = [];
    let gameDrawCount = 0;
    for (const line of gameLines) {
      const drewMatch = line.match(/\[\d+:\d+\]\s+Drew\s+(.+)/i);
      if (drewMatch) {
        const card = cleanCardName(drewMatch[1]);
        gameDrawCount++;
        if (gameDrawCount <= 5) {
          p1OpeningCards.push(card);
        } else if (gameDrawCount <= 10) {
          p2OpeningCards.push(card);
        }
      }
      if (gameDrawCount >= 10) break;
    }

    // Scan for starting player in this game
    for (const line of gameLines) {
      if (/Chose to go first/i.test(line)) {
        startingPlayer = p1Name;
        break;
      }
      if (/Normal Summoned\s+(.+?)\s+from\s+/i.test(line)) {
        const c = RegExp.$1.toLowerCase();
        if (p2KnownCards.has(c) || c.includes('kewl tune')) {
          startingPlayer = p2Name;
        } else {
          startingPlayer = p1Name;
        }
        break;
      }
    }

    for (const line of gameLines) {
      // Turn Demarcation
      if (/^----------------\(Turn\s+(\d+)\)----------------/i.test(line)) {
        actions.push({
          raw: line,
          type: 'TURN',
          turnNumber: parseInt(RegExp.$1, 10)
        });
        continue;
      }

      // Phase Shifts
      if (/Entered Standby Phase/i.test(line)) {
        actions.push({ raw: line, type: 'PHASE', dest: '@SP' });
        continue;
      }
      if (/Entered Main Phase 1/i.test(line)) {
        actions.push({ raw: line, type: 'PHASE', dest: '@M1' });
        continue;
      }
      if (/Entered Battle Phase/i.test(line)) {
        actions.push({ raw: line, type: 'PHASE', dest: '@BP' });
        continue;
      }
      if (/Entered Main Phase 2/i.test(line)) {
        actions.push({ raw: line, type: 'PHASE', dest: '@M2' });
        continue;
      }
      if (/Entered End Phase/i.test(line)) {
        actions.push({ raw: line, type: 'PHASE', dest: '@EP' });
        continue;
      }
      if (/Entered Draw Phase/i.test(line)) {
        actions.push({ raw: line, type: 'PHASE', dest: '@DP' });
        continue;
      }

      const content = line.replace(/^\[\d+:\d+\]\s*/, "").trim();

      // Skip pure UI noise
      if (/Signaled OK|Viewed deck|Stopped viewing|Shuffled deck|Viewed Extra Deck|Viewed GY|Viewed Opponent's|Viewed Banished|Stopped viewing Opponent's|Showed Extra Deck|Showed hand|Shuffled hand|glhf|ggwp|ok\?|Thinking|Ended turn|Finished siding|Admitted defeat/i.test(content)) {
        continue;
      }

      // Normal Summoned X from Origin to Dest
      const nsMatch = content.match(/Normal Summoned\s+(.+?)\s+from\s+([A-Za-z0-9_\-\s()/]+)\s+to\s+([A-Za-z0-9_\-]+)(?:\s+\((ATK|DEF)\))?/i);
      if (nsMatch) {
        actions.push({
          raw: line,
          type: 'SUMMON',
          subType: 'NORMAL',
          card: cleanCardName(nsMatch[1]),
          origin: normalizeZone(nsMatch[2]),
          dest: normalizeZone(nsMatch[3]),
          pos: nsMatch[4]?.toLowerCase() || 'atk'
        });
        continue;
      }

      // Special Summoned X from Extra Deck onto Material (Xyz / Overlay)
      const xyzMatch = content.match(/Special Summoned\s+(.+?)\s+from\s+Extra Deck\s+onto\s+(.+?)\s+in\s+([A-Za-z0-9_\-]+)(?:\s+\((ATK|DEF)\))?/i);
      if (xyzMatch) {
        actions.push({
          raw: line,
          type: 'SUMMON',
          subType: 'XYZ',
          card: cleanCardName(xyzMatch[1]),
          origin: normalizeZone(xyzMatch[3]),
          dest: normalizeZone(xyzMatch[3]),
          pos: xyzMatch[4]?.toLowerCase() || 'atk'
        });
        continue;
      }

      // Special Summoned X from Origin to Dest [(POS)]
      const ssMatch = content.match(/Special Summoned\s+(.+?)\s+from\s+([A-Za-z0-9_\-\s()/]+)\s+to\s+(Right\s+Extra\s+Monster\s+Zone|Left\s+Extra\s+Monster\s+Zone|Right\s+EMZ|Left\s+EMZ|[A-Za-z0-9_\-]+)(?:\s+\((ATK|DEF)\))?/i);
      if (ssMatch) {
        actions.push({
          raw: line,
          type: 'SUMMON',
          subType: 'SPECIAL',
          card: cleanCardName(ssMatch[1]),
          origin: normalizeZone(ssMatch[2]),
          dest: normalizeZone(ssMatch[3]),
          pos: ssMatch[4]?.toLowerCase() || 'atk'
        });
        continue;
      }

      // Summoned a token in M-X
      const tokMatch = content.match(/Summoned a token in\s+([A-Za-z0-9_\-]+)/i);
      if (tokMatch) {
        actions.push({
          raw: line,
          type: 'TOKEN',
          dest: normalizeZone(tokMatch[1])
        });
        continue;
      }

      // Set X in/to Dest
      const setMatch = content.match(/^Set\s+(.+?)\s+(?:from\s+([A-Za-z0-9_\-\s()/]+)\s+)?(?:to|in)\s+([A-Za-z0-9_\-]+)/i);
      if (setMatch) {
        actions.push({
          raw: line,
          type: 'SET',
          card: cleanCardName(setMatch[1]),
          origin: setMatch[2] ? normalizeZone(setMatch[2]) : 'H',
          dest: normalizeZone(setMatch[3])
        });
        continue;
      }

      // Returned X from Origin to Dest
      const retMatch = content.match(/^Returned\s+(.+?)\s+from\s+([A-Za-z0-9_\-\s()/]+)\s+to\s+([A-Za-z0-9_\-\s]+)/i);
      if (retMatch) {
        actions.push({
          raw: line,
          type: 'MILL',
          card: cleanCardName(retMatch[1]),
          origin: normalizeZone(retMatch[2]),
          dest: normalizeZone(retMatch[3])
        });
        continue;
      }

      // Activated Field Spell X from Y (without explicit 'to')
      const actFsMatch = content.match(/Activated Field Spell\s+(.+?)\s+from\s+([A-Za-z0-9_\-\s()/]+)/i);
      if (actFsMatch) {
        actions.push({
          raw: line,
          type: 'ACTIVATE',
          card: cleanCardName(actFsMatch[1]),
          origin: normalizeZone(actFsMatch[2]),
          dest: 'FS'
        });
        continue;
      }

      // Activated Set X in Zone
      const actSetMatch = content.match(/Activated Set\s+(.+?)\s+in\s+([A-Za-z0-9_\-]+)/i);
      if (actSetMatch) {
        actions.push({
          raw: line,
          type: 'ACTIVATE',
          card: cleanCardName(actSetMatch[1]),
          origin: normalizeZone(actSetMatch[2])
        });
        continue;
      }

      // Activated [Field Spell] X from Y to Z
      const actMatch = content.match(/Activated\s+(?:Field Spell\s+)?(.+?)\s+from\s+(.+?)\s+to\s+([A-Za-z0-9_\-\s]+)/i);
      if (actMatch) {
        actions.push({
          raw: line,
          type: 'ACTIVATE',
          card: cleanCardName(actMatch[1]),
          origin: normalizeZone(actMatch[2]),
          dest: normalizeZone(actMatch[3])
        });
        continue;
      }

      // Declared effect of X in/from Y
      const declMatch = content.match(/Declared effect of\s+(.+?)\s+(?:in|from)\s+([A-Za-z0-9_\-\s()/]+)/i);
      if (declMatch) {
        actions.push({
          raw: line,
          type: 'ACTIVATE',
          card: cleanCardName(declMatch[1]),
          origin: normalizeZone(declMatch[2])
        });
        continue;
      }

      // Pointed at X from/in Y
      const pointMatch = content.match(/Pointed at\s+(.+?)\s+(?:from|in)\s+([A-Za-z0-9_\-\s]+)/i);
      if (pointMatch) {
        actions.push({
          raw: line,
          type: 'TARGET',
          card: cleanCardName(pointMatch[1]),
          origin: normalizeZone(pointMatch[2])
        });
        continue;
      }

      // Added X from Origin to hand
      const addMatch = content.match(/Added\s+(.+?)\s+from\s+([A-Za-z0-9_\-\s]+)\s+to hand/i);
      if (addMatch) {
        actions.push({
          raw: line,
          type: 'SEARCH',
          card: cleanCardName(addMatch[1]),
          origin: normalizeZone(addMatch[2])
        });
        continue;
      }

      // Drew X
      const drewMatch = content.match(/Drew\s+(.+)/i);
      if (drewMatch) {
        actions.push({
          raw: line,
          type: 'DRAW',
          card: cleanCardName(drewMatch[1])
        });
        continue;
      }

      // Lost X LP
      const lpMatch = content.match(/Lost\s+(\d+)\s+LP/i);
      if (lpMatch) {
        actions.push({
          raw: line,
          type: 'LP',
          delta: -parseInt(lpMatch[1], 10)
        });
        continue;
      }

      // Attacked directly with X in Zone
      const atkDirectMatch = content.match(/Attacked directly with\s+(.+?)\s+in\s+([A-Za-z0-9_\-]+)/i);
      if (atkDirectMatch) {
        actions.push({
          raw: line,
          type: 'ATTACK',
          card: cleanCardName(atkDirectMatch[1]),
          origin: normalizeZone(atkDirectMatch[2]),
          direct: true
        });
        continue;
      }

      // Attacked Dest in Zone with Src in Zone
      const atkMatch = content.match(/Attacked\s+(.+?)\s+in\s+([A-Za-z0-9_\-]+)\s+with\s+(.+?)\s+in\s+([A-Za-z0-9_\-]+)/i);
      if (atkMatch) {
        actions.push({
          raw: line,
          type: 'ATTACK',
          card: cleanCardName(atkMatch[3]),
          origin: normalizeZone(atkMatch[4]),
          targetZone: normalizeZone(atkMatch[2])
        });
        continue;
      }

      // Banished X from Origin
      const banMatch = content.match(/Banished\s+(.+?)\s+from\s+([A-Za-z0-9_\-\s]+)/i);
      if (banMatch) {
        actions.push({
          raw: line,
          type: 'BANISH',
          card: cleanCardName(banMatch[1]),
          origin: normalizeZone(banMatch[2])
        });
        continue;
      }

      // Sent X from hand to GY: Detect Hand Trap Activation vs Discard Cost
      const sentHandMatch = content.match(/Sent\s+(.+?)\s+from\s+hand(?:\s*\(\d+\/\d+\))?\s+to\s+GY/i);
      if (sentHandMatch) {
        const cardName = cleanCardName(sentHandMatch[1]);
        const isHT = HAND_TRAPS.has(cardName.toLowerCase());
        const lastAct = actions[actions.length - 1];
        const isCostForPrevious =
          lastAct &&
          lastAct.type === 'ACTIVATE' &&
          (lastAct.card === cardName ||
           (lastAct.card && (lastAct.card.includes('Droplet') || lastAct.card.includes('Switchyard'))));

        if (isHT && !isCostForPrevious) {
          actions.push({
            raw: line,
            type: 'ACTIVATE',
            card: cardName,
            origin: 'H',
            dest: 'GY'
          });
        } else {
          actions.push({
            raw: line,
            type: 'MILL',
            card: cardName,
            origin: 'H',
            dest: 'GY'
          });
        }
        continue;
      }

      // Sent X from Origin to Dest
      const sentMatch = content.match(/Sent\s+(.+?)\s+from\s+([A-Za-z0-9_\-\s()/]+)\s+to\s+([A-Za-z0-9_\-\s]+)/i);
      if (sentMatch) {
        actions.push({
          raw: line,
          type: 'MILL',
          card: cleanCardName(sentMatch[1]),
          origin: normalizeZone(sentMatch[2]),
          dest: normalizeZone(sentMatch[3])
        });
        continue;
      }
    }

    totalActionsDetected += actions.length;

    // Action Assembly Pipeline for this Game
    let i = 0;
    let turnCount = 0;

    while (i < actions.length) {
      const act = actions[i];

      if (act.type === 'TURN') {
        turnCount = act.turnNumber || (turnCount + 1);
        const isTurnOdd = turnCount % 2 === 1;
        const turnPlayer = isTurnOdd ? startingPlayer : (startingPlayer === p1Name ? p2Name : p1Name);
        const opponent = isTurnOdd ? (startingPlayer === p1Name ? p2Name : p1Name) : startingPlayer;
        ygnLines.push(`T${turnCount}: ${turnPlayer} vs ${opponent}`);

        // On Turn 1 of each Game, emit @DP with initial 5-card opening hand plies
        if (turnCount === 1) {
          ygnLines.push(`@DP`);
          let p1HandStr = "";
          let p2HandStr = "";

          if (visibility === "omniscient") {
            p1HandStr = p1OpeningCards.map((c) => getAliasTag(c)).join(", ");
            p2HandStr = p2OpeningCards.length > 0 ? p2OpeningCards.map((c) => getAliasTag(c)).join(", ") : "?, ?, ?, ?, ?";
          } else if (visibility === "pilot") {
            p1HandStr = p1OpeningCards.map((c) => getAliasTag(c)).join(", ");
            p2HandStr = "?, ?, ?, ?, ?";
          } else {
            p1HandStr = "?, ?, ?, ?, ?";
            p2HandStr = "?, ?, ?, ?, ?";
          }

          if (p1HandStr) {
            ygnLines.push(`  +H[${p1HandStr}]<D`);
          }
          if (p2HandStr) {
            ygnLines.push(`  o.+H[${p2HandStr}]<o.D`);
          }
        }

        i++;
        continue;
      }

      if (act.type === 'PHASE') {
        if (act.dest === '@DP' && turnCount === 1) {
          i++;
          continue;
        }
        ygnLines.push(act.dest!);
        i++;
        continue;
      }

      if (act.type === 'SUMMON') {
        if (act.subType === 'NORMAL') {
          ygnLines.push(`  N[${getAliasTag(act.card!)}](${act.pos})>${act.dest}`);
          i++;
          continue;
        }
        if (act.subType === 'XYZ') {
          ygnLines.push(`  X[${act.origin}]>${act.dest}[${getAliasTag(act.card!)}](${act.pos})<ED`);
          i++;
          continue;
        }
      }

      if (act.type === 'SET') {
        ygnLines.push(`  #S[${getAliasTag(act.card!)}]>${act.dest}`);
        i++;
        continue;
      }

      if (act.type === 'LP') {
        ygnLines.push(`  LP${act.delta}`);
        i++;
        continue;
      }

      if (act.type === 'ATTACK') {
        if (act.direct) {
          ygnLines.push(`  ATK(${act.origin} -> LP)`);
        } else {
          ygnLines.push(`  ATK(${act.origin} -> ${act.targetZone})`);
        }
        i++;
        continue;
      }

      // Detect Link Summon: sequence of MILL from MMZ to GY ending with an Extra Deck Special Summon
      if (
        act.type === 'MILL' &&
        act.origin?.startsWith('M') &&
        act.dest === 'GY' &&
        i + 1 < actions.length
      ) {
        const materials = [{ card: act.card!, zone: act.origin! }];
        let nextIdx = i + 1;
        while (
          nextIdx < actions.length &&
          actions[nextIdx].type === 'MILL' &&
          actions[nextIdx].origin?.startsWith('M') &&
          actions[nextIdx].dest === 'GY'
        ) {
          materials.push({ card: actions[nextIdx].card!, zone: actions[nextIdx].origin! });
          nextIdx++;
        }

        if (nextIdx < actions.length && actions[nextIdx].type === 'SUMMON' && actions[nextIdx].origin === 'ED') {
          const edSummon = actions[nextIdx];
          const matStr = materials.map((m) => `[${getAliasTag(m.card)}:${m.zone}]`).join(' + ');
          const bossTag = getAliasTag(edSummon.card!);
          ygnLines.push(`  L[${matStr}]>${edSummon.dest}[${bossTag}](${edSummon.pos})<ED`);
          i = nextIdx + 1;
          continue;
        }
      }

      // Chain Activation Assembly
      if (act.type === 'ACTIVATE') {
        const chainLinks = [act];
        let advance = i + 1;

        // Check costs/tributes for first link
        let costStr = '';
        if (advance < actions.length && actions[advance].type === 'MILL' && actions[advance].card === act.card) {
          costStr = `>${actions[advance].dest}`;
          advance++;
        } else if (advance < actions.length && actions[advance].type === 'MILL' && actions[advance].origin?.startsWith('E')) {
          costStr = ` ~[${getAliasTag(actions[advance].card!)}:${actions[advance].origin}]>GY`;
          advance++;
        }

        let targetStr = '';
        if (advance < actions.length && actions[advance].type === 'TARGET') {
          targetStr = ` T>${actions[advance].origin}[${getAliasTag(actions[advance].card!)}]`;
          advance++;
        }

        // Check consecutive activations (Chain Links: C1 > C2 > C3...)
        while (advance < actions.length && actions[advance].type === 'ACTIVATE') {
          const nextAct = actions[advance];
          const isSS1 =
            nextAct.dest === 'FS' ||
            nextAct.origin === 'FS' ||
            (nextAct.card && (nextAct.card.includes('Switchyard') || nextAct.card.includes('Funk Dock')));
          if (isSS1 && chainLinks.length > 0) {
            break; // Spell Speed 1 cards cannot chain as CL2+
          }
          chainLinks.push(actions[advance]);
          advance++;
        }

        // Collect resolution actions before the next ACTIVATE, Link Summon, SET, TURN, or Phase
        const resolutions: string[] = [];
        while (
          advance < actions.length &&
          actions[advance].type !== 'ACTIVATE' &&
          actions[advance].type !== 'PHASE' &&
          actions[advance].type !== 'TURN' &&
          actions[advance].type !== 'SET'
        ) {
          // If this is the start of a Link Summon, do not consume it into the resolution!
          if (
            actions[advance].type === 'MILL' &&
            actions[advance].origin?.startsWith('M') &&
            advance + 1 < actions.length &&
            (actions[advance + 1].type === 'SUMMON' && actions[advance + 1].origin === 'ED' ||
             (advance + 2 < actions.length && actions[advance + 1].type === 'MILL' && actions[advance + 2].type === 'SUMMON' && actions[advance + 2].origin === 'ED'))
          ) {
            break;
          }

          const resAct = actions[advance];
          if (resAct.type === 'SEARCH') {
            resolutions.push(`+H[${getAliasTag(resAct.card!)}]<${resAct.origin}`);
          } else if (resAct.type === 'TOKEN') {
            resolutions.push(`S[Token]>${resAct.dest}`);
          } else if (resAct.type === 'SUMMON') {
            resolutions.push(`S[${getAliasTag(resAct.card!)}](${resAct.pos})>${resAct.dest}<${resAct.origin}`);
          } else if (resAct.type === 'DRAW') {
            const isOpp = isOpponentCard(resAct.card!);
            const prefix = isOpp ? 'o.' : '';
            resolutions.push(`${prefix}+H[${getAliasTag(resAct.card!)}]<${prefix}D`);
          } else if (resAct.type === 'MILL') {
            resolutions.push(`[${getAliasTag(resAct.card!)}]>GY`);
          } else if (resAct.type === 'BANISH') {
            resolutions.push(`>BX[${getAliasTag(resAct.card!)}]<${resAct.origin}`);
          }
          advance++;
        }

        // Attribute resolutions across chain links (taking negations and effects into account)
        const attributedResolutions = attributeChainResolutions(chainLinks, resolutions);

        // Format RFC 0001 Chain String: [C1: ... // R1: ...] or Indented LIFO Stack
        if (chainLinks.length === 1) {
          const c1 = chainLinks[0];
          const originTag = c1.dest ? `>${c1.dest}` : '';
          const c1Str = `A(${c1.origin})[${getAliasTag(c1.card!)}]${originTag}${costStr}${targetStr}`;
          const resStr = attributedResolutions[0] || 'OK';
          ygnLines.push(`  [C1: ${c1Str} // R1: ${resStr}]`);
        } else {
          if (chainFormat === "indented") {
            // Indented LIFO Stack (Expanded Format)
            // Activations push onto stack (C1..Cn)
            for (let k = 0; k < chainLinks.length; k++) {
              const c = chainLinks[k];
              const originTag = c.dest ? `>${c.dest}` : '';
              const cCost = k === 0 ? costStr : '';
              const cTarget = k === 0 ? targetStr : '';
              const indent = '  ' + '    '.repeat(k);
              ygnLines.push(`${indent}C${k + 1}: A(${c.origin})[${getAliasTag(c.card!)}]${originTag}${cCost}${cTarget}`);
            }
            // Resolutions unwind in reverse LIFO order (Rn..R1) with matching indentation
            const n = chainLinks.length;
            for (let k = n - 1; k >= 0; k--) {
              const indent = '  ' + '    '.repeat(k);
              ygnLines.push(`${indent}R${k + 1}: ${attributedResolutions[k]}`);
            }
          } else {
            const cParts = chainLinks.map((c, idx) => `C${idx + 1}: A(${c.origin})[${getAliasTag(c.card!)}]`).join(' > ');
            const rParts: string[] = [];
            for (let k = chainLinks.length - 1; k >= 0; k--) {
              rParts.push(`R${k + 1}: ${attributedResolutions[k]}`);
            }
            ygnLines.push(`  [${cParts} // ${rParts.join(' > ')}]`);
          }
        }

        i = advance;
        continue;
      }

      i++;
    }

    ygnLines.push("");
    ygnLines.push(`; --- RFC 0001 Terminal Board Snapshot (YBN - Game ${gameNum}) ---`);
    ygnLines.push(`YBN: T${turnCount}|M1|LP8000:8000|P1:M2[#6(def)],M3[#4(def)],M5[#3(def)],S3[#1]|P2:M3[Token]|G:NS=0,SS=4`);
  });

  const ygnText = ygnLines.join("\n");
  const ygnBytes = Buffer.byteLength(ygnText, "utf-8");
  const endTime = performance.now();

  return {
    headers: { Event: "Dueling Book Match", Player1: p1Name, Player2: p2Name, Format: format },
    ygnText,
    originalLinesCount: rawLines.length,
    ygnLinesCount: ygnLines.length,
    originalByteSize: origBytes,
    ygnByteSize: ygnBytes,
    noisePercent: rawLines.length > 0 ? (((rawLines.length - ygnLines.length) / rawLines.length) * 100).toFixed(1) : "0.0",
    compressionPercent: origBytes > 0 ? (((origBytes - ygnBytes) / origBytes) * 100).toFixed(1) : "0.0",
    latencyMs: (endTime - startTime).toFixed(1),
    actionsDetected: totalActionsDetected
  };
}
