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
  assert(result.compressionPercent > 60.0, "Should achieve at least 60% byte compression");
  assert(result.ygnText.includes("T1:"), "Should contain Turn 1 header");
  assert(result.ygnText.includes("Qliphort Genius"), "Should preserve card names like Qliphort Genius");
  assert(result.ygnText.includes("Droll & Lock Bird"), "Should preserve Droll & Lock Bird");

  // 3. Test Lexer / AST Parser on generated YGN
  console.log("-> Testing YGN Lexer AST Parsing on generated transcript...");
  const doc = parseYgn(result.ygnText);
  assert(doc.turns.length > 0, "AST should parse at least 1 turn");
  console.log(`   Parsed ${doc.turns.length} turns in AST.`);
  for (const t of doc.turns) {
    console.log(`   Turn ${t.turnNumber}: ${t.turnPlayer} (${t.phases.length} phases, ${t.phases.reduce((acc, p) => acc + p.actions.length, 0)} actions)`);
  }

  // 4. Save Golden Fixture Output
  const goldenPath = path.resolve(__dirname, "../fixtures/sample_match.ygn");
  fs.writeFileSync(goldenPath, result.ygnText, "utf-8");
  console.log(`-> Saved golden YGN output to: fixtures/sample_match.ygn`);

  console.log("\n>>> ALL YGN TESTS PASSED SUCCESSFULLY! <<<");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
