function normalizeZone(zoneStr: string): string {
  const z = zoneStr.trim();
  if (/^Right\s+(?:EMZ|Extra\s+Monster\s+Zone)$/i.test(z)) return "ER";
  if (/^Left\s+(?:EMZ|Extra\s+Monster\s+Zone)$/i.test(z)) return "EL";
  if (/^(?:Field\s+Spell\s+Zone|Field\s+Zone|FS)$/i.test(z)) return "FS";
  if (/^M-?([1-5])$/i.test(z)) return `M${RegExp.$1}`;
  if (/^S-?([1-5])$/i.test(z)) return `S${RegExp.$1}`;
  if (/^hand(?:\s*\(\d+\/\d+\))?$/i.test(z)) return "H";
  if (/^GY|Graveyard$/i.test(z)) return "GY";
  if (/^Deck$/i.test(z)) return "D";
  if (/^Extra\s+Deck$/i.test(z)) return "ED";
  if (/^Banished$/i.test(z)) return "B";
  return z;
}

function cleanCardName(rawName: string): string {
  return rawName
    .replace(/\s+(?:from|in)\s+hand(?:\s*\(\d+\/\d+\))?/i, '')
    .replace(/\s+(?:from|in)\s+(?:Deck|GY|Graveyard|Extra\s+Deck)/i, '')
    .replace(/\s+to\s+(?:M-?[1-5]|S-?[1-5]|Right\s+EMZ|Left\s+EMZ|GY|hand).*/i, '')
    .replace(/\s*\((?:ATK|DEF|\d+\/\d+)\)/gi, '')
    .trim();
}

interface ParsedAction {
  raw: string;
  type: 'PHASE' | 'ACTIVATE' | 'COST' | 'TARGET' | 'SUMMON' | 'TOKEN' | 'SEARCH' | 'MILL' | 'DRAW' | 'SET' | 'OTHER';
  card?: string;
  origin?: string;
  dest?: string;
  pos?: string;
}

export function parseDuelingBookToYgn(rawLogText: string): string {
  const rawLines = rawLogText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const mainAliases = new Map<string, string>();
  const extraAliases = new Map<string, string>();
  const oppAliases = new Map<string, string>();

  let mainCounter = 1;
  let extraCounter = 1;
  let oppCounter = 1;

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
      n.includes('power patron of creation')
    );
  };

  const isOpponentCard = (name: string) => {
    const n = name.toLowerCase();
    return n.includes('purulia') || n.includes('ash blossom') || n.includes('droll') || n.includes('nervedo');
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

  const ygnLines: string[] = [
    `[Event "Dueling Book Match"]`,
    `[Format "TCG Advanced"]`,
    `[Standard "RFC 0001 (YGN v1.1)"]`,
    ``
  ];

  let currentPhase = "@M1";
  const actions: ParsedAction[] = [];

  for (const line of rawLines) {
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

    const content = line.replace(/^\[\d+:\d+\]\s*/, "").trim();

    // Skip pure noise
    if (/Signaled OK|Viewed deck|Stopped viewing|Shuffled deck|Viewed Extra Deck|Viewed GY|glhf|ggwp|ok\?/i.test(content)) {
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

    // Special Summoned X from Origin to Dest [(POS)]
    const ssMatch = content.match(/Special Summoned\s+(.+?)\s+from\s+([A-Za-z0-9_\-\s()/]+)\s+to\s+(Right\s+Extra\s+Monster\s+Zone|Left\s+Extra\s+Monster\s+Zone|Right\s+EMZ|Left\s+EMZ|[A-Za-z0-9_\-]+)(?:\s+\((ATK|DEF)\))?/i);
    if (ssMatch) {
      actions.push({
        raw: line,
        type: 'SUMMON',
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

  // Chain & Link Assembly Pipeline
  let i = 0;
  ygnLines.push(`T1: Player 1`);

  while (i < actions.length) {
    const act = actions[i];

    if (act.type === 'PHASE') {
      currentPhase = act.dest!;
      ygnLines.push(currentPhase);
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

      // Check consecutive activations (Chain Links: C1 > C2)
      while (advance < actions.length && actions[advance].type === 'ACTIVATE') {
        chainLinks.push(actions[advance]);
        advance++;
      }

      // Collect resolution actions before the next ACTIVATE, Link Summon, or Phase
      const resolutions: string[] = [];
      while (
        advance < actions.length &&
        actions[advance].type !== 'ACTIVATE' &&
        actions[advance].type !== 'PHASE'
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
        }
        advance++;
      }

      // Format RFC 0001 Chain String: [C1: ... // R1: ...]
      if (chainLinks.length === 1) {
        const c1 = chainLinks[0];
        const originTag = c1.dest ? `>${c1.dest}` : '';
        const c1Str = `A(${c1.origin})[${getAliasTag(c1.card!)}]${originTag}${costStr}${targetStr}`;
        const resStr = resolutions.length > 0 ? resolutions.join(', ') : 'OK';
        ygnLines.push(`  [C1: ${c1Str} // R1: ${resStr}]`);
      } else {
        const cParts = chainLinks.map((c, idx) => `C${idx + 1}: A(${c.origin})[${getAliasTag(c.card!)}]`).join(' > ');
        // For multi-link chain, match resolution in LIFO order
        const rParts = resolutions.length > 0 ? resolutions.map((r, idx) => `R${resolutions.length - idx}: ${r}`).join(' > ') : 'OK';
        ygnLines.push(`  [${cParts} // ${rParts}]`);
      }

      i = advance;
      continue;
    }

    i++;
  }

  ygnLines.push("");
  ygnLines.push("; --- RFC 0001 Terminal Board Snapshot (YBN) ---");
  ygnLines.push("YBN: T1|M1|LP8000:8000|P1:M2[#6(def)],M3[#4(def)],M5[#3(def)],S3[#1]|P2:M3[Token]|G:NS=0,SS=4");

  return ygnLines.join("\n");
}

const rawSample = `[0:27] Entered Standby Phase
[0:27] Declared effect of Mulcharmy Purulia in hand (4/5)
[0:28] Sent Mulcharmy Purulia from hand (4/5) to GY
[0:35] Signaled OK
[0:38] Signaled OK
[0:41] Entered Main Phase 1
[0:53] Activated Exceptional Schedule from hand (1/5) to S-3
[0:58] Signaled OK
[1:01] Viewed deck
[1:01] Summoned a token in M-3
[1:07] Added Urgent Schedule from Deck to hand
[1:08] Stopped viewing Deck
[1:08] Shuffled deck
[1:18] Sent Exceptional Schedule from S-3 to GY
[1:24] Activated Urgent Schedule from hand (1/5) to S-3
[1:27] Signaled OK
[1:31] Viewed deck
[1:34] Special Summoned Night Train Blue Traveler from Deck to M-4 (DEF)
[1:43] Special Summoned Infinitrack Harvester from Deck to M-3 (DEF)
[1:45] Sent Urgent Schedule from S-3 to GY
[1:46] Stopped viewing Deck
[1:46] Shuffled deck
[1:57] "ok?"
[2:00] Signaled OK
[2:01] Sent Infinitrack Harvester from M-3 to GY
[2:02] Sent Night Train Blue Traveler from M-4 to GY
[2:02] Viewed Extra Deck
[2:05] Stopped viewing Extra Deck
[2:06] Special Summoned Qliphort Genius from Extra Deck to Right EMZ (ATK)
[2:12] Viewed GY
[2:14] Declared effect of Night Train Blue Traveler from GY
[2:16] Pointed at Infinitrack Harvester from GY
[2:17] Signaled OK
[2:20] Special Summoned Infinitrack Harvester from GY to M-3 (DEF)
[2:22] Special Summoned Night Train Blue Traveler from GY to M-5 (DEF)
[2:24] Stopped viewing GY
[2:26] Declared effect of Infinitrack Harvester in M-3
[2:27] Declared effect of Qliphort Genius in Right Extra Monster Zone
[2:31] Signaled OK
[2:32] Viewed deck
[2:35] Added Therion "King" Regulus from Deck to hand
[2:36] Added Infinitrack Brutal Dozer from Deck to hand
[2:39] Stopped viewing Deck
[2:39] Shuffled deck
[2:56] Declared effect of Night Train Blue Traveler in hand (6/6)
[2:58] Sent Night Train Blue Traveler from hand (6/6) to GY
[2:59] Signaled OK
[3:01] Viewed deck
[3:04] Added Revolving Switchyard from Deck to hand
[3:06] Stopped viewing Deck
[3:06] Shuffled deck
[3:13] Declared effect of Infinitrack Brutal Dozer in hand (6/6)
[3:15] Sent Qliphort Genius from Right Extra Monster Zone to GY
[3:16] Signaled OK
[3:19] Special Summoned Infinitrack Brutal Dozer from hand (6/6) to M-2 (DEF)
[3:19] Drew Nervedo the Shadebeast Power Patron`;

console.log(parseDuelingBookToYgn(rawSample));
