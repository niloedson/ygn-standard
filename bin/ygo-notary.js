#!/usr/bin/env node
/**
 * @file ygo-notary.js
 * @description Official CLI Match Notary and Algebraic Transcriber (RFC 0001).
 * Converts raw Dueling Book plain-text match logs into standardized YGN/YBN algebraic records.
 * Note: Binary .yrp replays (from automated simulators like EDOPro/Omega) are not supported.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { convertDuelingBookToYgn } from '../dist/converters/duelingbookToYgn.js';

function printHelp() {
  console.log(`
Haunted Labs & YGN Working Group
RFC 0001 Match Notary & Algebraic Transcriber (ygo-notary)

USAGE:
  ygo-notary transcribe <duelingbook_log.txt> [options]
  cat duel_log.txt | ygo-notary transcribe -

NOTE:
  This tool transcribes plain-text match logs (Dueling Book).
  Binary .yrp replays (EDOPro, Omega) are not supported.

OPTIONS:
  -o, --output <file>     Write standardized YGN output to file instead of stdout
  -s, --stats             Print compression and noise reduction metrics
  -h, --help              Display this help message
  -v, --version           Display version

EXAMPLES:
  npx ygo-notary transcribe duel_log.txt -o match.ygn --stats
  npx ygo-notary transcribe match.txt
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('-v') || args.includes('--version')) {
    console.log('ygo-notary v1.0.0 (RFC 0001)');
    process.exit(0);
  }

  const command = args[0];
  if (command !== 'transcribe') {
    console.error(`Unknown command: "${command}". Use "ygo-notary --help" for usage.`);
    process.exit(1);
  }

  const inputTarget = args[1];
  if (!inputTarget) {
    console.error('Error: Missing input log file. Provide a path or "-" to read from stdin.');
    process.exit(1);
  }

  let rawLog = '';
  if (inputTarget === '-') {
    rawLog = readFileSync(0, 'utf-8');
  } else {
    rawLog = readFileSync(resolve(inputTarget), 'utf-8');
  }

  const startTime = performance.now();
  const result = convertDuelingBookToYgn(rawLog);
  const endTime = performance.now();
  const latencyMs = (endTime - startTime).toFixed(1);
  const noisePercent = result.originalLinesCount > 0
    ? (((result.originalLinesCount - result.ygnLinesCount) / result.originalLinesCount) * 100).toFixed(1)
    : '0.0';

  const outIdx = args.findIndex((a) => a === '-o' || a === '--output');
  if (outIdx !== -1 && args[outIdx + 1]) {
    const outFile = resolve(args[outIdx + 1]);
    writeFileSync(outFile, result.ygnText, 'utf-8');
    console.log(`[PASS] Standardized YGN written to: ${outFile}`);
  } else {
    console.log(result.ygnText);
  }

  if (args.includes('-s') || args.includes('--stats')) {
    console.error(`\n--- Notary Telemetry ---`);
    console.error(`Original Lines: ${result.originalLinesCount}`);
    console.error(`YGN Lines:      ${result.ygnLinesCount}`);
    console.error(`Noise Stripped: ${noisePercent}%`);
    console.error(`Compression:    ${result.compressionPercent}%`);
    console.error(`Latency:        ${latencyMs} ms`);
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
