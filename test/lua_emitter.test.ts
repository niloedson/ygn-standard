import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-ignore
import fengari from "fengari";

const { lua, lauxlib, lualib } = fengari;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function runLuaTest() {
  console.log("=== Testing Lua YGN Emitter (via Lua VM) ===");

  const luaState = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(luaState);

  const luaFilePath = path.resolve(__dirname, "../lua/ygn_emitter.lua");
  const luaCode = fs.readFileSync(luaFilePath, "utf-8");

  // Load ygn_emitter.lua into the VM
  const status = lauxlib.luaL_dostring(luaState, fengari.to_luastring(luaCode));
  if (status !== lua.LUA_OK) {
    const err = lua.lua_tojsstring(luaState, -1);
    throw new Error(`Lua loading error: ${err}`);
  }

  // Define a Lua test runner script using the loaded module
  const runnerScript = `
    local YGNEmitter = dofile("${luaFilePath.replace(/\\/g, "/")}")
    local emitter = YGNEmitter.new("MULCHARMY MEOWLS", "nedson_br", "TCG Advanced")

    emitter:start_turn(1, 0)
    emitter:set_phase("@SP")
    emitter:chain_declare(1, 1, "Mulcharmy Purulia", 0x02, 0)
    emitter:chain_resolve(1, "OK ~LING(o.+H<D on S<H)")
    emitter:finish_chain()

    emitter:set_phase("@M1")
    emitter:emit_normal_summon(0, "Infinitrack Harvester", 2)
    emitter:emit_special_summon(0, "Night Train Blue Traveler", 0x01, 3, 0x4)
    emitter:emit_lp_delta(1, -2000, 6000)

    return emitter:get_transcript()
  `;

  const runStatus = lauxlib.luaL_dostring(luaState, fengari.to_luastring(runnerScript));
  if (runStatus !== lua.LUA_OK) {
    const err = lua.lua_tojsstring(luaState, -1);
    throw new Error(`Lua execution error: ${err}`);
  }

  const outputTranscript = lua.lua_tojsstring(luaState, -1);
  console.log("-> Emitted YGN Output from Lua:\n" + outputTranscript);

  // Assertions on Lua emitted output
  assert(outputTranscript.includes('[Event "ocgcore Emitted Match"]'), "Should contain header");
  assert(outputTranscript.includes("T1: MULCHARMY MEOWLS"), "Should contain Turn 1");
  assert(outputTranscript.includes("N[Infinitrack Harvester]>M3"), "Should output correct Normal Summon zone");
  assert(outputTranscript.includes("S[Night Train Blue Traveler](def)>M4<D"), "Should output Special Summon with position and origin");
  assert(outputTranscript.includes("[C1: A(o.H)[Mulcharmy Purulia] // R1: OK ~LING(o.+H<D on S<H)]"), "Should output atomic chain block");
  assert(outputTranscript.includes("P2.LP-2000(6000)"), "Should output LP delta with verified state");

  console.log("\n>>> ALL LUA EMITTER TESTS PASSED SUCCESSFULLY! <<<");
}

runLuaTest();
