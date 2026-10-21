import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { convertDuelingBookToYgn } from "../src/converters/duelingbookToYgn.js";
import { parseYgn } from "../src/lexer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log("=== YGN Reference Implementation & Converter Verification ===");

  const fixturePath = path.resolve(__dirname, "../fixtures/sample_match.raw.txt");
  const rawLog = fs.readFileSync(fixturePath, "utf-8");

  console.log(`-> Input Raw Log: ${rawLog.length} bytes, ${rawLog.split("\n").length} lines`);

  // 1. Run Dueling Book to YGN Conversion
  const result = convertDuelingBookToYgn(rawLog);

  console.log("-> Conversion Results:");
  console.log(`   Lines: ${result.originalLinesCount} -> ${result.ygnLinesCount} (${((1 - result.ygnLinesCount / result.originalLinesCount) * 100).toFixed(1)}% reduction)`);
  console.log(`   Bytes: ${result.originalByteSize} -> ${result.ygnByteSize} (${result.compressionPercent}% compression)`);
  console.log(`   Actions Detected: ${result.actionsDetected}`);
  console.log(`   Players: ${result.headers["Player1"] || "MULCHARMY MEOWLS"} vs ${result.headers["Player2"] || "nedson_br"}`);

  // 2. Validate Assertions
  assert(result.actionsDetected > 40, "Should detect at least 40 game actions");
  assert(parseFloat(result.compressionPercent) > 55.0, "Should achieve at least 55% byte compression");
  assert(result.ygnText.includes("T1:"), "Should contain Turn 1 header");
  assert(result.ygnText.includes("Qliphort Genius"), "Should preserve card names like Qliphort Genius");
  assert(result.ygnText.includes("Droll & Lock Bird"), "Should preserve Droll & Lock Bird");

  // Test Visibility Options (Omniscient, Pilot, Spectator)
  console.log("-> Testing Visibility Perspectives (Omniscient, Pilot, Spectator)...");
  const pilotRes = convertDuelingBookToYgn(rawLog, { visibility: "pilot" });
  assert(pilotRes.ygnText.includes('[Visibility "Pilot_P1"]'), "Must have Pilot_P1 header");
  assert(pilotRes.ygnText.includes("o.+H[?, ?, ?, ?, ?]<o.D"), "Opponent hand must be masked with ? in Pilot POV");

  const specRes = convertDuelingBookToYgn(rawLog, { visibility: "spectator" });
  assert(specRes.ygnText.includes('[Visibility "Spectator"]'), "Must have Spectator header");
  assert(specRes.ygnText.includes("+H[?, ?, ?, ?, ?]<D"), "P1 hand must be masked with ? in Spectator POV");
  assert(specRes.ygnText.includes("o.+H[?, ?, ?, ?, ?]<o.D"), "P2 hand must be masked with ? in Spectator POV");
  console.log("   Successfully validated Omniscient, Pilot, and Spectator visibility modes.");

  // 3. Test Lexer / AST Parser on generated YGN
  console.log("-> Testing YGN Lexer AST Parsing on generated transcript...");
  const doc = parseYgn(result.ygnText);
  assert(doc.turns.length > 0, "AST should parse at least 1 turn");
  console.log(`   Parsed ${doc.turns.length} turns in AST.`);
  for (const t of doc.turns) {
    console.log(`   Turn ${t.turnNumber}: ${t.turnPlayer} (${t.phases.length} phases, ${t.phases.reduce((acc, p) => acc + p.actions.length, 0)} actions)`);
  }

  // 4. Test Indented LIFO Stack conversion mode
  console.log("-> Testing Indented LIFO Stack conversion mode...");
  const indentedResult = convertDuelingBookToYgn(rawLog, { chainFormat: "indented" });
  assert(indentedResult.ygnText.includes("C1:"), "Should contain C1 activation marker");
  assert(indentedResult.ygnText.includes("C2:"), "Should contain C2 activation marker");
  assert(indentedResult.ygnText.includes("R2:"), "Should contain R2 resolution marker");
  assert(indentedResult.ygnText.includes("R1:"), "Should contain R1 resolution marker");

  // Validate AST parsing on indented YGN output
  const indentedDoc = parseYgn(indentedResult.ygnText);
  assert(indentedDoc.turns.length > 0, "AST should parse turns from indented YGN");
  console.log("   Successfully parsed indented LIFO YGN with AST parser.");

  // 5. Save Golden Fixture Output
  const goldenPath = path.resolve(__dirname, "../fixtures/sample_match.ygn");
  fs.writeFileSync(goldenPath, result.ygnText, "utf-8");
  console.log(`-> Saved golden YGN output to: fixtures/sample_match.ygn`);

  // 6. Test Multi-Game Best-of-3 Match Fixture (duel_log_test.txt)
  const testMatchPath = path.resolve(__dirname, "../fixtures/duel_log_test.txt");
  if (fs.existsSync(testMatchPath)) {
    console.log("\n=== Testing Best-of-3 Match Fixture (duel_log_test.txt) ===");
    const matchRaw = fs.readFileSync(testMatchPath, "utf-8");
    const matchRes = convertDuelingBookToYgn(matchRaw, { chainFormat: "indented" });

    console.log(`-> Match Conversion: ${matchRes.originalLinesCount} lines -> ${matchRes.ygnLinesCount} YGN lines (${matchRes.noisePercent}% noise stripped)`);
    assert(matchRes.ygnText.includes('[Round "Game 1"]'), "Must partition Game 1");
    assert(matchRes.ygnText.includes('[Round "Game 2"]'), "Must partition Game 2");
    assert(matchRes.ygnText.includes('[Round "Game 3"]'), "Must partition Game 3");
    assert(matchRes.ygnText.includes("Mulcharmy Fuwalos"), "Must recognize Fuwalos");
    assert(matchRes.ygnText.includes("Ash Blossom"), "Must recognize Ash Blossom");

    const matchDoc = parseYgn(matchRes.ygnText);
    assert(matchDoc.turns.length >= 5, "Match should contain at least 5 turns across 3 games");
    console.log(`   AST parsed ${matchDoc.turns.length} turns across 3 games.`);

    // Save upgraded result
    const outTestPath = path.resolve(__dirname, "../fixtures/notary_result_test.ygn");
    fs.writeFileSync(outTestPath, matchRes.ygnText, "utf-8");
    console.log(`-> Updated fixtures/notary_result_test.ygn with verified transcription.`);
  }

  console.log("\n>>> ALL YGN TESTS PASSED SUCCESSFULLY! <<<");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
