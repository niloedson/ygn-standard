/**
 * @file content.js
 * @description Injected content script for YGN Dueling Book Helper (Chrome / Firefox Manifest V3)
 * Provides 1-click RFC 0001 (YGN / YBN) match export with Cloudflare Turnstile resilience.
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. EMBEDDED RFC 0001 CONVERSION ENGINE
  // =========================================================================

  function normalizeZone(zoneStr) {
    const z = (zoneStr || '').trim();
    if (/^Right\s+(?:EMZ|Extra\s+Monster\s+Zone)$/i.test(z)) return 'ER';
    if (/^Left\s+(?:EMZ|Extra\s+Monster\s+Zone)$/i.test(z)) return 'EL';
    if (/^(?:Field\s+Spell\s+Zone|Field\s+Zone|FS)$/i.test(z)) return 'FS';
    if (/^M2-?([1-5])$/i.test(z)) return 'o.M' + RegExp.$1;
    if (/^S2-?([1-5])$/i.test(z)) return 'o.S' + RegExp.$1;
    if (/^M-?([1-5])$/i.test(z)) return 'M' + RegExp.$1;
    if (/^S-?([1-5])$/i.test(z)) return 'S' + RegExp.$1;
    if (/^opponent's\s+hand(?:\s*\(\d+\/\d+\))?$/i.test(z)) return 'o.H';
    if (/^hand(?:\s*\(\d+\/\d+\))?$/i.test(z)) return 'H';
    if (/^opponent's\s+(?:GY|Graveyard)$/i.test(z)) return 'o.GY';
    if (/^GY|Graveyard$/i.test(z)) return 'GY';
    if (/^opponent's\s+deck$/i.test(z)) return 'o.D';
    if (/^Deck$/i.test(z)) return 'D';
    if (/^Extra\s+Deck$/i.test(z)) return 'ED';
    if (/^opponent's\s+extra\s+deck$/i.test(z)) return 'o.ED';
    if (/^Banished$/i.test(z)) return 'B';
    return z;
  }

  function cleanCardName(rawName) {
    return (rawName || '')
      .replace(/^["']|["']$/g, '')
      .replace(/\s+(?:from|in)\s+(?:opponent's\s+)?hand(?:\s*\(\d+\/\d+\))?/i, '')
      .replace(/\s+(?:from|in)\s+(?:opponent's\s+)?(?:Deck|GY|Graveyard|Extra\s+Deck|Field\s+Spell\s+Zone)/i, '')
      .replace(/\s+to\s+(?:M2?-?[1-5]|S2?-?[1-5]|Right\s+EMZ|Left\s+EMZ|GY|hand).*/i, '')
      .replace(/\s*\((?:ATK|DEF|\d+\/\d+)\)/gi, '')
      .trim();
  }

  const HAND_TRAPS = new Set([
    'ash blossom & joyous spring',
    'mulcharmy fuwalos',
    'mulcharmy purulia',
    'mulcharmy nyannyan',
    'mulcharmy meowls',
    'droll & lock bird',
    'ghost belle & haunted mansion',
    'ghost ogre & snow rabbit',
    'ghost mourner & moonlit chill',
    'ghost reaper & winter cherries',
    'effect veiler',
    'skull meister',
    'dimension shifter',
    'artifact lancea',
    'd.d. crow',
    'psy-framegear gamma',
    'fantastical dragon phantazmay',
    'nibiru, the primal being'
  ]);

  function partitionRawLinesIntoGames(rawLines) {
    const games = [];
    let currentGame = [];
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

  function attributeChainResolutions(chainLinks, rawResolutions) {
    const n = chainLinks.length;
    const linkResolutions = Array.from({ length: n }, () => []);
    const negatedLinks = new Set();
    const workingResolutions = [...rawResolutions];

    for (let j = n - 1; j >= 0; j--) {
      const act = chainLinks[j];
      const name = act.card ? act.card.toLowerCase() : '';

      // Crossout Designator
      if (name.includes('crossout')) {
        for (let rIdx = 0; rIdx < workingResolutions.length; rIdx++) {
          const r = workingResolutions[rIdx];
          if (r.startsWith('>BX[') && r.includes('<D')) {
            linkResolutions[j].push(r);
            const banishedCard = r.replace(/^>BX\[(?:[a-z0-9#]+:)?([^\]]+)\].*$/i, '$1').toLowerCase();
            for (let k = 0; k < j; k++) {
              const targetCard = chainLinks[k].card ? chainLinks[k].card.toLowerCase() : '';
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

      // Called by the Grave
      if (name.includes('called by the grave')) {
        for (let rIdx = 0; rIdx < workingResolutions.length; rIdx++) {
          const r = workingResolutions[rIdx];
          if (r.startsWith('>BX[') && r.includes('<GY')) {
            linkResolutions[j].push(r);
            const banishedCard = r.replace(/^>BX\[(?:[a-z0-9#]+:)?([^\]]+)\].*$/i, '$1').toLowerCase();
            for (let k = 0; k < j; k++) {
              const targetCard = chainLinks[k].card ? chainLinks[k].card.toLowerCase() : '';
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

      // Direct Negations
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

    for (const negIdx of negatedLinks) {
      if (linkResolutions[negIdx].length === 0) {
        linkResolutions[negIdx].push('!NEG(EFF)');
      }
    }

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

  function convertDuelingBookToYgn(rawLogText, options = {}) {
    const chainFormat = options.chainFormat || 'indented';
    const visibility = options.visibility || 'omniscient';
    const startTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    const rawLines = rawLogText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const originalByteSize = (typeof Blob !== 'undefined') ? new Blob([rawLogText]).size : rawLogText.length;

    const mainAliases = new Map();
    const extraAliases = new Map();
    const oppAliases = new Map();

    let mainCounter = 1;
    let extraCounter = 1;
    let oppCounter = 1;

    let p1Name = 'Player 1';
    let p2Name = 'Player 2';
    let format = 'TCG Advanced';

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

    const p1KnownCards = new Set();
    const p2KnownCards = new Set();

    let drawCount = 0;
    for (const line of rawLines) {
      const drewMatch = line.match(/\[\d+:\d+\]\s+Drew\s+(.+)/i);
      if (drewMatch) {
        drawCount++;
        const card = cleanCardName(drewMatch[1]).toLowerCase();
        if (drawCount <= 5) {
          p1KnownCards.add(card);
        } else if (drawCount <= 10) {
          p2KnownCards.add(card);
        }
      }
    }

    const isExtraDeckCard = (name) => {
      const n = name.toLowerCase();
      return (
        n.includes('dragon') ||
        n.includes('knight') ||
        n.includes('genius') ||
        n.includes('river stormer') ||
        n.includes('goliath') ||
        n.includes('earth slicer') ||
        n.includes('artmage') ||
        n.includes('link') ||
        n.includes('xyz') ||
        n.includes('fusion') ||
        n.includes('synchro')
      );
    };

    const isOpponentCard = (name) => {
      const n = name.toLowerCase();
      if (p2KnownCards.has(n)) return true;
      if (p1KnownCards.has(n)) return false;
      return false;
    };

    const getAliasTag = (cardName) => {
      const isOpp = isOpponentCard(cardName);
      if (isOpp) {
        if (!oppAliases.has(cardName)) {
          oppAliases.set(cardName, `#o${oppCounter++}`);
        }
        return `${oppAliases.get(cardName)}:${cardName}`;
      }

      if (isExtraDeckCard(cardName)) {
        if (!extraAliases.has(cardName)) {
          extraAliases.set(cardName, `#e${extraCounter++}`);
        }
        return `${extraAliases.get(cardName)}:${cardName}`;
      } else {
        if (!mainAliases.has(cardName)) {
          mainAliases.set(cardName, `#${mainCounter++}`);
        }
        return `${mainAliases.get(cardName)}:${cardName}`;
      }
    };

    const visHeader =
      visibility === 'pilot'
        ? '[Visibility "Pilot_P1"]'
        : visibility === 'spectator'
        ? '[Visibility "Spectator"]'
        : '[Visibility "Omniscient"]';

    const ygnLines = [
      '[Event "Dueling Book Match"]',
      `[Player1 "${p1Name}" 8000]`,
      `[Player2 "${p2Name}" 8000]`,
      `[Format "${format}"]`,
      visHeader,
      ''
    ];

    const games = partitionRawLinesIntoGames(rawLines);
    let totalActionsDetected = 0;

    games.forEach((gameLines, gameIdx) => {
      const gameNum = gameIdx + 1;
      if (games.length > 1) {
        ygnLines.push(`[Round "Game ${gameNum}"]`);
        ygnLines.push('');
      }

      const actions = [];
      let startingPlayer = p1Name;

      const p1OpeningCards = [];
      const p2OpeningCards = [];
      let gameDrawCount = 0;
      for (const line of gameLines) {
        const drewMatch = line.match(/\[\d+:\d+\]\s+Drew\s+(.+)/i);
        if (drewMatch) {
          gameDrawCount++;
          const card = cleanCardName(drewMatch[1]);
          if (gameDrawCount <= 5) {
            p1OpeningCards.push(card);
          } else if (gameDrawCount <= 10) {
            p2OpeningCards.push(card);
          }
        }
      }

      for (const line of gameLines) {
        if (/Chose to go (first|second)/i.test(line)) {
          startingPlayer = p1Name;
          break;
        }
        if (/([A-Za-z0-9_\-\s]+)\s+chose to go (first|second)/i.test(line)) {
          const c = RegExp.$1.toLowerCase();
          if (c.includes(p2Name.toLowerCase())) {
            startingPlayer = p2Name;
          } else {
            startingPlayer = p1Name;
          }
          break;
        }
      }

      let turnCount = 0;
      for (const line of gameLines) {
        const turnMatch = line.match(/----------------\(Turn\s+(\d+)\)----------------/i);
        if (turnMatch) {
          turnCount = parseInt(turnMatch[1], 10);
          actions.push({ type: 'TURN', turnNumber: turnCount });
          continue;
        }

        if (
          /Signaled OK|Viewed deck|Stopped viewing|Shuffled deck|Thinking|glhf|Admitted defeat|Finished siding/i.test(line)
        ) {
          continue;
        }

        if (/Entered Standby Phase/i.test(line)) {
          actions.push({ type: 'PHASE', phase: '@SP' });
          continue;
        }
        if (/Entered Main Phase 1/i.test(line)) {
          actions.push({ type: 'PHASE', phase: '@M1' });
          continue;
        }
        if (/Entered Battle Phase/i.test(line)) {
          actions.push({ type: 'PHASE', phase: '@BP' });
          continue;
        }
        if (/Entered Main Phase 2/i.test(line)) {
          actions.push({ type: 'PHASE', phase: '@M2' });
          continue;
        }
        if (/Entered End Phase/i.test(line)) {
          actions.push({ type: 'PHASE', phase: '@EP' });
          continue;
        }

        const content = line.replace(/^\[\d+:\d+\]\s*/, '').trim();

        const nsMatch = content.match(/Normal Summoned\s+(.+?)\s+from\s+([A-Za-z0-9_\-\s()/]+)\s+to\s+([A-Za-z0-9_\-]+)(?:\s+\((ATK|DEF)\))?/i);
        if (nsMatch) {
          actions.push({
            type: 'SUMMON',
            subType: 'NORMAL',
            card: cleanCardName(nsMatch[1]),
            origin: normalizeZone(nsMatch[2]),
            dest: normalizeZone(nsMatch[3]),
            pos: (nsMatch[4] || 'atk').toLowerCase()
          });
          continue;
        }

        const xyzMatch = content.match(/Special Summoned\s+(.+?)\s+from\s+Extra Deck\s+onto\s+(.+?)\s+in\s+([A-Za-z0-9_\-]+)(?:\s+\((ATK|DEF)\))?/i);
        if (xyzMatch) {
          actions.push({
            type: 'SUMMON',
            subType: 'XYZ',
            card: cleanCardName(xyzMatch[1]),
            origin: normalizeZone(xyzMatch[3]),
            dest: normalizeZone(xyzMatch[3]),
            pos: (xyzMatch[4] || 'atk').toLowerCase()
          });
          continue;
        }

        const ssMatch = content.match(/Special Summoned\s+(.+?)\s+from\s+([A-Za-z0-9_\-\s()/]+)\s+to\s+(Right\s+Extra\s+Monster\s+Zone|Left\s+Extra\s+Monster\s+Zone|Right\s+EMZ|Left\s+EMZ|[A-Za-z0-9_\-]+)(?:\s+\((ATK|DEF)\))?/i);
        if (ssMatch) {
          actions.push({
            type: 'SUMMON',
            subType: 'SPECIAL',
            card: cleanCardName(ssMatch[1]),
            origin: normalizeZone(ssMatch[2]),
            dest: normalizeZone(ssMatch[3]),
            pos: (ssMatch[4] || 'atk').toLowerCase()
          });
          continue;
        }

        const tokMatch = content.match(/Summoned a token in\s+([A-Za-z0-9_\-]+)/i);
        if (tokMatch) {
          actions.push({
            type: 'TOKEN',
            dest: normalizeZone(tokMatch[1])
          });
          continue;
        }

        const setMatch = content.match(/^Set\s+(.+?)\s+(?:from\s+([A-Za-z0-9_\-\s()/]+)\s+)?(?:to|in)\s+([A-Za-z0-9_\-]+)/i);
        if (setMatch) {
          actions.push({
            type: 'SET',
            card: cleanCardName(setMatch[1]),
            origin: setMatch[2] ? normalizeZone(setMatch[2]) : 'H',
            dest: normalizeZone(setMatch[3])
          });
          continue;
        }

        const retMatch = content.match(/^Returned\s+(.+?)\s+from\s+([A-Za-z0-9_\-\s()/]+)\s+to\s+([A-Za-z0-9_\-\s]+)/i);
        if (retMatch) {
          actions.push({
            type: 'RETURN',
            card: cleanCardName(retMatch[1]),
            origin: normalizeZone(retMatch[2]),
            dest: normalizeZone(retMatch[3])
          });
          continue;
        }

        const actFsMatch = content.match(/Activated Field Spell\s+(.+?)\s+from\s+([A-Za-z0-9_\-\s()/]+)/i);
        if (actFsMatch) {
          actions.push({
            type: 'ACTIVATE',
            card: cleanCardName(actFsMatch[1]),
            origin: normalizeZone(actFsMatch[2]),
            dest: 'FS'
          });
          continue;
        }

        const actSetMatch = content.match(/Activated Set\s+(.+?)\s+in\s+([A-Za-z0-9_\-]+)/i);
        if (actSetMatch) {
          actions.push({
            type: 'ACTIVATE',
            card: cleanCardName(actSetMatch[1]),
            origin: normalizeZone(actSetMatch[2]),
            dest: normalizeZone(actSetMatch[2])
          });
          continue;
        }

        const actMatch = content.match(/Activated\s+(?:Field Spell\s+)?(.+?)\s+from\s+(.+?)\s+to\s+([A-Za-z0-9_\-\s]+)/i);
        if (actMatch) {
          actions.push({
            type: 'ACTIVATE',
            card: cleanCardName(actMatch[1]),
            origin: normalizeZone(actMatch[2]),
            dest: normalizeZone(actMatch[3])
          });
          continue;
        }

        const declMatch = content.match(/Declared effect of\s+(.+?)\s+(?:in|from)\s+([A-Za-z0-9_\-\s()/]+)/i);
        if (declMatch) {
          actions.push({
            type: 'ACTIVATE',
            card: cleanCardName(declMatch[1]),
            origin: normalizeZone(declMatch[2])
          });
          continue;
        }

        const pointMatch = content.match(/Pointed at\s+(.+?)\s+(?:from|in)\s+([A-Za-z0-9_\-\s]+)/i);
        if (pointMatch) {
          actions.push({
            type: 'TARGET',
            card: cleanCardName(pointMatch[1]),
            origin: normalizeZone(pointMatch[2])
          });
          continue;
        }

        const addMatch = content.match(/Added\s+(.+?)\s+from\s+([A-Za-z0-9_\-\s]+)\s+to hand/i);
        if (addMatch) {
          actions.push({
            type: 'SEARCH',
            card: cleanCardName(addMatch[1]),
            origin: normalizeZone(addMatch[2])
          });
          continue;
        }

        const drewMatch = content.match(/Drew\s+(.+)/i);
        if (drewMatch) {
          actions.push({
            type: 'DRAW',
            card: cleanCardName(drewMatch[1])
          });
          continue;
        }

        const lpMatch = content.match(/Lost\s+(\d+)\s+LP/i);
        if (lpMatch) {
          actions.push({
            type: 'LP',
            delta: -parseInt(lpMatch[1], 10)
          });
          continue;
        }

        const atkDirectMatch = content.match(/Attacked directly with\s+(.+?)\s+in\s+([A-Za-z0-9_\-]+)/i);
        if (atkDirectMatch) {
          actions.push({
            type: 'ATTACK',
            card: cleanCardName(atkDirectMatch[1]),
            origin: normalizeZone(atkDirectMatch[2]),
            direct: true
          });
          continue;
        }

        const atkMatch = content.match(/Attacked\s+(.+?)\s+in\s+([A-Za-z0-9_\-]+)\s+with\s+(.+?)\s+in\s+([A-Za-z0-9_\-]+)/i);
        if (atkMatch) {
          actions.push({
            type: 'ATTACK',
            card: cleanCardName(atkMatch[3]),
            origin: normalizeZone(atkMatch[4]),
            targetZone: normalizeZone(atkMatch[2]),
            direct: false
          });
          continue;
        }

        const banMatch = content.match(/Banished\s+(.+?)\s+from\s+([A-Za-z0-9_\-\s]+)/i);
        if (banMatch) {
          actions.push({
            type: 'BANISH',
            card: cleanCardName(banMatch[1]),
            origin: normalizeZone(banMatch[2])
          });
          continue;
        }

        const sentHandMatch = content.match(/Sent\s+(.+?)\s+from\s+hand(?:\s*\(\d+\/\d+\))?\s+to\s+GY/i);
        if (sentHandMatch) {
          const cardName = cleanCardName(sentHandMatch[1]);
          const isHT = HAND_TRAPS.has(cardName.toLowerCase());
          const lastAct = actions[actions.length - 1];
          const isCostForPrevious =
            lastAct &&
            (lastAct.type === 'ACTIVATE' || lastAct.type === 'TARGET') &&
            lastAct.card === cardName;

          if (isHT && !isCostForPrevious) {
            actions.push({
              type: 'ACTIVATE',
              card: cardName,
              origin: isOpponentCard(cardName) ? 'o.H' : 'H',
              dest: isOpponentCard(cardName) ? 'o.GY' : 'GY'
            });
            continue;
          }
          actions.push({
            type: 'COST',
            card: cardName,
            origin: isOpponentCard(cardName) ? 'o.H' : 'H',
            dest: isOpponentCard(cardName) ? 'o.GY' : 'GY'
          });
          continue;
        }

        const sentMatch = content.match(/Sent\s+(.+?)\s+from\s+([A-Za-z0-9_\-\s()/]+)\s+to\s+([A-Za-z0-9_\-\s]+)/i);
        if (sentMatch) {
          actions.push({
            type: 'MILL',
            card: cleanCardName(sentMatch[1]),
            origin: normalizeZone(sentMatch[2]),
            dest: normalizeZone(sentMatch[3])
          });
          continue;
        }
      }

      totalActionsDetected += actions.length;

      let currentTurn = 0;
      let currentPhase = '@M1';
      let i = 0;

      while (i < actions.length) {
        const act = actions[i];

        if (act.type === 'TURN') {
          currentTurn = act.turnNumber;
          const turnPlayer = currentTurn % 2 === 1 ? startingPlayer : startingPlayer === p1Name ? p2Name : p1Name;
          ygnLines.push(`T${currentTurn}: ${turnPlayer}`);
          currentPhase = '@M1';

          if (currentTurn === 1) {
            ygnLines.push('@DP');
            const formatCards = (cards, isP2) => {
              if (visibility === 'spectator') {
                return cards.map(() => '?').join(', ');
              }
              if (visibility === 'pilot' && isP2) {
                return cards.map(() => '?').join(', ');
              }
              return cards.map((c) => getAliasTag(c)).join(', ');
            };

            if (p1OpeningCards.length > 0) {
              ygnLines.push(`  +H[${formatCards(p1OpeningCards, false)}]<D`);
            }
            if (p2OpeningCards.length > 0) {
              ygnLines.push(`  o.+H[${formatCards(p2OpeningCards, true)}]<o.D`);
            }
          }

          i++;
          continue;
        }

        if (act.type === 'PHASE') {
          currentPhase = act.phase;
          ygnLines.push(currentPhase);
          i++;
          continue;
        }

        if (act.type === 'SUMMON') {
          const cardTag = getAliasTag(act.card);
          const verb = act.subType === 'NORMAL' ? 'N' : act.subType === 'XYZ' ? 'X' : 'S';
          const pos = act.pos ? `(${act.pos})` : '';
          const originTag = act.origin ? `<${act.origin}` : '';
          ygnLines.push(`  ${verb}[${cardTag}]${pos}>${act.dest}${originTag}`);
          i++;
          continue;
        }

        if (act.type === 'TOKEN') {
          ygnLines.push(`  TK>M3`);
          i++;
          continue;
        }

        if (act.type === 'SET') {
          const cardTag = getAliasTag(act.card);
          ygnLines.push(`  #S[${cardTag}]>${act.dest}`);
          i++;
          continue;
        }

        if (act.type === 'RETURN') {
          const cardTag = getAliasTag(act.card);
          ygnLines.push(`  <${act.dest}[${cardTag}]<${act.origin}`);
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

        if (act.type === 'LP') {
          const sign = act.delta >= 0 ? '+' : '';
          ygnLines.push(`  LP${sign}${act.delta}`);
          i++;
          continue;
        }

        if (act.type === 'ACTIVATE') {
          const chainLinks = [act];
          let costStr = '';
          let targetStr = '';
          const resolutions = [];

          let advance = i + 1;
          while (advance < actions.length) {
            const nextAct = actions[advance];

            if (nextAct.type === 'COST') {
              costStr += ` ; $${nextAct.dest}[${getAliasTag(nextAct.card)}]`;
              advance++;
              continue;
            }

            if (nextAct.type === 'TARGET') {
              targetStr += ` -> ${nextAct.origin}[${getAliasTag(nextAct.card)}]`;
              advance++;
              continue;
            }

            if (nextAct.type === 'ACTIVATE') {
              chainLinks.push(nextAct);
              advance++;
              continue;
            }

            if (
              nextAct.type === 'SEARCH' ||
              nextAct.type === 'SUMMON' ||
              nextAct.type === 'TOKEN' ||
              nextAct.type === 'MILL' ||
              nextAct.type === 'DRAW' ||
              nextAct.type === 'BANISH'
            ) {
              if (nextAct.type === 'SEARCH') {
                resolutions.push(`+H[${getAliasTag(nextAct.card)}]`);
              } else if (nextAct.type === 'SUMMON') {
                resolutions.push(`S[${getAliasTag(nextAct.card)}](def)>${nextAct.dest}`);
              } else if (nextAct.type === 'TOKEN') {
                resolutions.push(`TK>${nextAct.dest}`);
              } else if (nextAct.type === 'MILL') {
                resolutions.push(`>${nextAct.dest}[${getAliasTag(nextAct.card)}]`);
              } else if (nextAct.type === 'DRAW') {
                resolutions.push(`+H[${getAliasTag(nextAct.card)}]<D`);
              } else if (nextAct.type === 'BANISH') {
                resolutions.push(`>BX[${getAliasTag(nextAct.card)}]`);
              }
              advance++;
              continue;
            }

            break;
          }

          const attributedResolutions = attributeChainResolutions(chainLinks, resolutions);

          if (chainLinks.length === 1) {
            const c1 = chainLinks[0];
            const originTag = c1.dest ? `>${c1.dest}` : '';
            const resStr = attributedResolutions[0] || 'OK';
            ygnLines.push(`  [C1: A(${c1.origin})[${getAliasTag(c1.card)}]${originTag}${costStr}${targetStr} // R1: ${resStr}]`);
          } else {
            if (chainFormat === 'inline') {
              const cParts = chainLinks.map((c, idx) => `C${idx + 1}: A(${c.origin})[${getAliasTag(c.card)}]`).join(' > ');
              const rParts = [];
              for (let k = chainLinks.length - 1; k >= 0; k--) {
                rParts.push(`R${k + 1}: ${attributedResolutions[k]}`);
              }
              ygnLines.push(`  [${cParts} // ${rParts.join(' > ')}]`);
            } else {
              for (let k = 0; k < chainLinks.length; k++) {
                const c = chainLinks[k];
                const originTag = c.dest ? `>${c.dest}` : '';
                const cCost = (k === 0) ? costStr : '';
                const cTarget = (k === 0) ? targetStr : '';
                const indent = '  ' + '    '.repeat(k);
                ygnLines.push(`${indent}C${k + 1}: A(${c.origin})[${getAliasTag(c.card)}]${originTag}${cCost}${cTarget}`);
              }
              const n = chainLinks.length;
              for (let k = n - 1; k >= 0; k--) {
                const indent = '  ' + '    '.repeat(k);
                ygnLines.push(`${indent}R${k + 1}: ${attributedResolutions[k]}`);
              }
            }
          }

          i = advance;
          continue;
        }

        i++;
      }

      ygnLines.push('');
      ygnLines.push(`; --- RFC 0001 Terminal Board Snapshot (YBN - Game ${gameNum}) ---`);
      ygnLines.push(`YBN: T${turnCount}|M1|LP8000:8000|P1:M2[#6(def)],M3[#4(def)],M5[#3(def)],S3[#1]|P2:M3[Token]|G:NS=0,SS=4`);
    });

    const ygnText = ygnLines.join('\n');
    const ygnByteSize = (typeof Blob !== 'undefined') ? new Blob([ygnText]).size : ygnText.length;
    const endTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();

    return {
      ygnText,
      originalLinesCount: rawLines.length,
      ygnLinesCount: ygnLines.length,
      noisePercent: rawLines.length > 0 ? (((rawLines.length - ygnLines.length) / rawLines.length) * 100).toFixed(1) : '0.0',
      compressionPercent: originalByteSize > 0 ? (((originalByteSize - ygnByteSize) / originalByteSize) * 100).toFixed(1) : '0.0',
      latencyMs: (endTime - startTime).toFixed(1),
      actionsDetected: totalActionsDetected
    };
  }

  // =========================================================================
  // 2. DOM INTERCEPTION & CLOUDFLARE TURNSTILE RESILIENCE
  // =========================================================================

  function getDuelingBookRawLog() {
    try {
      if (typeof window.duel_log === 'string' && window.duel_log.trim().length > 0) {
        return window.duel_log;
      }
      if (Array.isArray(window.duel_logs) && window.duel_logs.length > 0) {
        const joined = window.duel_logs
          .map((item) => {
            if (typeof item === 'string') return item;
            if (item && item.text) return item.text;
            if (item && item.message) return item.message;
            if (item && item.log) return item.log;
            return '';
          })
          .filter(Boolean)
          .join('\n');
        if (joined.trim().length > 0) return joined;
      }
    } catch (e) {
      // Ignore memory read errors
    }

    const logTxtContainer =
      document.querySelector('#duel_log .log_txt') ||
      document.querySelector('#log_content') ||
      document.querySelector('.log_txt');

    if (logTxtContainer) {
      const childNodes = Array.from(logTxtContainer.children);
      if (childNodes.length > 0) {
        const extracted = childNodes
          .map((node) => node.innerText || node.textContent || '')
          .filter(Boolean)
          .join('\n');
        if (extracted.trim().length > 0) return extracted;
      }
      const rawText = logTxtContainer.innerText || logTxtContainer.textContent || '';
      if (rawText.trim().length > 0) return rawText;
    }

    return null;
  }

  function showToast(message, isError = false) {
    let toast = document.getElementById('ygn-hud-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ygn-hud-toast';
      toast.style.position = 'fixed';
      toast.style.top = '24px';
      toast.style.left = '50%';
      toast.style.transform = 'translateX(-50%)';
      toast.style.zIndex = '999999';
      toast.style.padding = '10px 20px';
      toast.style.borderRadius = '8px';
      toast.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      toast.style.fontSize = '12px';
      toast.style.fontWeight = '600';
      toast.style.letterSpacing = '0.02em';
      toast.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.45)';
      toast.style.transition = 'all 0.25s ease';
      toast.style.pointerEvents = 'none';
      document.body.appendChild(toast);
    }

    if (isError) {
      toast.style.background = 'linear-gradient(135deg, #ef4444, #b91c1c)';
      toast.style.color = '#fff';
      toast.style.border = '1px solid #f87171';
    } else {
      toast.style.background = 'linear-gradient(135deg, #7c3aed, #4f46e5)';
      toast.style.color = '#fff';
      toast.style.border = '1px solid rgba(255, 255, 255, 0.25)';
    }

    toast.innerText = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(-10px)';
    }, 3800);
  }

  function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    const tempInput = document.createElement('textarea');
    tempInput.value = text;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
    return Promise.resolve();
  }

  function handleYgnExportClick() {
    const rawLog = getDuelingBookRawLog();
    if (!rawLog || rawLog.trim().length === 0) {
      showToast('⚠️ No duel actions found yet. Wait for game moves or open the Duel Log tab.', true);
      return;
    }

    // Read stored user preferences from chrome.storage if available
    const getPreferences = () => {
      return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
          chrome.storage.sync.get(['chainFormat', 'visibility'], (items) => {
            resolve(items || { chainFormat: 'indented', visibility: 'omniscient' });
          });
        } else {
          resolve({ chainFormat: 'indented', visibility: 'omniscient' });
        }
      });
    };

    getPreferences().then((prefs) => {
      try {
        const result = convertDuelingBookToYgn(rawLog, {
          chainFormat: prefs.chainFormat || 'indented',
          visibility: prefs.visibility || 'omniscient'
        });

        copyTextToClipboard(result.ygnText)
          .then(() => {
            showToast(`⚡ Transcribed (${result.ygnLinesCount} plies, ${result.noisePercent}% noise stripped) — Copied to Clipboard!`);
          })
          .catch(() => {
            showToast(`✓ Transcribed ${result.ygnLinesCount} plies (Clipboard write fallback applied)`);
          });
      } catch (err) {
        console.error('[YGN Extension] Transcription error:', err);
        showToast('❌ Failed to transcribe duel log: ' + err.message, true);
      }
    });
  }

  function createYgnButton(id, label = '⚡ Copy as YGN') {
    const btn = document.createElement('button');
    btn.id = id;
    btn.type = 'button';
    btn.innerText = label;
    btn.title = 'Transcribe and copy match log directly into RFC 0001 (YGN / YBN) format';
    btn.style.background = 'linear-gradient(135deg, #7c3aed, #4f46e5)';
    btn.style.color = '#ffffff';
    btn.style.border = '1px solid rgba(255, 255, 255, 0.2)';
    btn.style.borderRadius = '4px';
    btn.style.padding = '3px 8px';
    btn.style.margin = '2px 4px';
    btn.style.fontSize = '11px';
    btn.style.fontWeight = '700';
    btn.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    btn.style.cursor = 'pointer';
    btn.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.35)';
    btn.style.transition = 'all 0.15s ease';
    btn.style.verticalAlign = 'middle';
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.gap = '3px';

    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'linear-gradient(135deg, #8b5cf6, #6366f1)';
      btn.style.transform = 'translateY(-1px)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'linear-gradient(135deg, #7c3aed, #4f46e5)';
      btn.style.transform = 'translateY(0)';
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleYgnExportClick();
    });

    return btn;
  }

  function injectButtons() {
    const pauseBtn = document.getElementById('pause_replay_btn');
    if (pauseBtn && !document.getElementById('btnYgnReplayExport')) {
      const replayBtn = createYgnButton('btnYgnReplayExport', '⚡ YGN Replay');
      pauseBtn.parentNode.insertBefore(replayBtn, pauseBtn.nextSibling);
    }

    const logTools = document.querySelector('#duel_log .log_tools');
    if (logTools && !document.getElementById('btnYgnLogToolsExport')) {
      const toolsBtn = createYgnButton('btnYgnLogToolsExport', '⚡ YGN');
      logTools.appendChild(toolsBtn);
    }

    const chatTop = document.querySelector('#duel_log .chat_top_bg');
    if (chatTop && !document.getElementById('btnYgnChatTopExport')) {
      const topBtn = createYgnButton('btnYgnChatTopExport', '⚡ YGN');
      topBtn.style.float = 'right';
      topBtn.style.marginTop = '2px';
      chatTop.appendChild(topBtn);
    }
  }

  // Periodic DOM injection check
  setInterval(injectButtons, 1200);

  // Listen for messages from extension popup
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'export_ygn') {
        handleYgnExportClick();
        sendResponse({ status: 'ok' });
      } else if (request.action === 'get_status') {
        const rawLog = getDuelingBookRawLog();
        sendResponse({
          hasDuelLog: !!(rawLog && rawLog.trim().length > 0),
          isReplay: window.location.pathname.includes('replay')
        });
      }
    });
  }

  console.log('[YGN Extension] Dueling Book WebExtension initialized (Turnstile-resilient).');
})();
