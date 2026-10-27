import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function testUserscript() {
  console.log('=== Testing YGN Dueling Book Helper Userscript ===');

  const userscriptPath = path.resolve(__dirname, '../userscripts/ygn-duelingbook.user.js');
  assert(fs.existsSync(userscriptPath), 'Userscript file must exist');

  const scriptContent = fs.readFileSync(userscriptPath, 'utf-8');

  // 1. Verify Tampermonkey Metadata Header
  assert(scriptContent.includes('// ==UserScript=='), 'Must contain UserScript header');
  assert(scriptContent.includes('// @name         YGN Dueling Book Helper (ygn-db-helper)'), 'Must define correct name');
  assert(scriptContent.includes('// @match        https://www.duelingbook.com/*'), 'Must match Dueling Book URLs');
  assert(scriptContent.includes('// @grant        GM_setClipboard'), 'Must request clipboard permission');
  assert(scriptContent.includes('// ==/UserScript=='), 'Must close UserScript header');
  console.log('  ✓ Tampermonkey metadata block verified.');

  // 2. Test Execution in sandboxed VM with simulated Dueling Book DOM
  const fixturePath = path.resolve(__dirname, '../fixtures/sample_match.raw.txt');
  const rawLog = fs.readFileSync(fixturePath, 'utf-8');

  let clipboardOutput = '';
  let toastMessage = '';

  const mockWindow = {
    duel_log: rawLog,
    document: {
      getElementById: (id: string) => {
        if (id === 'pause_replay_btn') {
          return {
            parentNode: {
              insertBefore: () => {}
            },
            nextSibling: null
          };
        }
        return null;
      },
      querySelector: (selector: string) => {
        if (selector === '#duel_log .log_tools' || selector === '#duel_log .chat_top_bg') {
          return {
            appendChild: () => {}
          };
        }
        return null;
      },
      querySelectorAll: () => [],
      createElement: (tag: string) => ({
        style: {},
        addEventListener: () => {},
        setAttribute: () => {},
        appendChild: () => {}
      }),
      body: {
        appendChild: () => {}
      }
    },
    navigator: {
      clipboard: {
        writeText: async (text: string) => {
          clipboardOutput = text;
        }
      }
    },
    GM_setClipboard: (text: string) => {
      clipboardOutput = text;
    },
    setInterval: () => {},
    performance: {
      now: () => Date.now()
    },
    console
  };

  const context = vm.createContext(mockWindow);

  // Run userscript in context
  vm.runInContext(scriptContent, context);
  console.log('  ✓ Userscript executed in sandboxed browser DOM VM without errors.');

  // Validate that conversion engine works by extracting Section 1 from script
  const engineMatch = scriptContent.match(/\/\/ =+\r?\n\s*\/\/ 1\. EMBEDDED RFC 0001 CONVERSION ENGINE[\s\S]+?\/\/ =+\r?\n\s*\/\/ 2\. DOM INTERCEPTION/);
  assert(engineMatch, 'Must find Section 1 engine inside userscript');

  const sandbox = {
    rawLogText: rawLog,
    result: null as any
  };
  vm.createContext(sandbox);

  const runnerCode = `
    ${engineMatch[0].replace('// =========================================================================\n  // 2. DOM INTERCEPTION', '')}
    result = convertDuelingBookToYgn(rawLogText, { chainFormat: 'indented', visibility: 'omniscient' });
  `;
  vm.runInContext(runnerCode, sandbox);

  assert(sandbox.result, 'Converter should produce result');
  console.log('  Debug result:', {
    actionsDetected: sandbox.result.actionsDetected,
    lines: sandbox.result.ygnLinesCount,
    origLines: sandbox.result.originalLinesCount,
    compressionPercent: sandbox.result.compressionPercent,
    noisePercent: sandbox.result.noisePercent
  });
  assert(sandbox.result.ygnText.includes('[Event "Dueling Book Match"]'), 'Should contain Event header');
  assert(sandbox.result.ygnText.includes('T1:'), 'Should contain Turn 1');
  assert(sandbox.result.actionsDetected > 40, 'Should detect game actions');
  assert(parseFloat(sandbox.result.compressionPercent) > 40, 'Should achieve substantial byte compression');
  assert(parseFloat(sandbox.result.noisePercent) > 60, 'Should achieve >60% noise reduction');

  console.log(`  ✓ Successfully transcribed fixture: ${sandbox.result.actionsDetected} actions, ${sandbox.result.noisePercent}% noise stripped.`);
  console.log('\n>>> ALL USERSCRIPT TESTS PASSED SUCCESSFULLY! <<<');
}

testUserscript();
