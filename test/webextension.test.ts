import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function testWebExtension() {
  console.log('=== Testing YGN Dueling Book Helper WebExtension (Manifest V3) ===');

  const extDir = path.resolve(__dirname, '../extensions/ygn-db-helper');
  assert(fs.existsSync(extDir), 'Extension directory must exist');

  // 1. Verify manifest.json
  const manifestPath = path.join(extDir, 'manifest.json');
  assert(fs.existsSync(manifestPath), 'manifest.json must exist');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  assert.strictEqual(manifest.manifest_version, 3, 'Must be Manifest V3');
  assert.strictEqual(manifest.name, 'YGN Dueling Book Helper', 'Name must match');
  assert.strictEqual(manifest.version, '1.0.0', 'Version must match');
  assert(manifest.content_scripts && manifest.content_scripts.length > 0, 'Must define content_scripts');
  assert(manifest.content_scripts[0].matches.includes('https://www.duelingbook.com/*'), 'Must match Dueling Book');
  assert(manifest.permissions.includes('clipboardWrite'), 'Must request clipboardWrite permission');
  assert(manifest.permissions.includes('storage'), 'Must request storage permission');
  console.log('  ✓ manifest.json adheres to Manifest V3 specifications.');

  // 2. Verify Icons
  for (const size of [16, 48, 128]) {
    const iconPath = path.join(extDir, `icons/icon-${size}.png`);
    assert(fs.existsSync(iconPath), `Icon ${size}x${size} must exist`);
    const iconBuf = fs.readFileSync(iconPath);
    // Verify PNG header signature
    assert(iconBuf[0] === 0x89 && iconBuf[1] === 0x50 && iconBuf[2] === 0x4e && iconBuf[3] === 0x47, 'Must be valid PNG file');
  }
  console.log('  ✓ 16x16, 48x48, and 128x128 PNG icons verified.');

  // 3. Verify Popup UI & Script
  const popupHtmlPath = path.join(extDir, 'popup.html');
  const popupJsPath = path.join(extDir, 'popup.js');
  assert(fs.existsSync(popupHtmlPath), 'popup.html must exist');
  assert(fs.existsSync(popupJsPath), 'popup.js must exist');
  const popupHtml = fs.readFileSync(popupHtmlPath, 'utf-8');
  assert(popupHtml.includes('btnExport'), 'Must contain Export button');
  assert(popupHtml.includes('chainFormatSelect'), 'Must contain Chain Format selector');
  console.log('  ✓ popup.html and popup.js verified.');

  // 4. Verify Content Script Execution in Sandboxed VM
  const contentJsPath = path.join(extDir, 'content.js');
  assert(fs.existsSync(contentJsPath), 'content.js must exist');
  const contentJs = fs.readFileSync(contentJsPath, 'utf-8');

  const mockWindow = {
    location: { pathname: '/replay' },
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, addEventListener: () => {} }),
      body: { appendChild: () => {} }
    },
    navigator: {
      clipboard: { writeText: async () => {} }
    },
    setInterval: () => {},
    performance: { now: () => Date.now() },
    chrome: {
      storage: { sync: { get: () => {} } },
      runtime: { onMessage: { addListener: () => {} } }
    },
    console
  };

  const context = vm.createContext(mockWindow);
  vm.runInContext(contentJs, context);
  console.log('  ✓ content.js executed in sandboxed browser DOM VM without errors.');

  // 5. Verify Packaged Zip Archive
  const zipPath = path.resolve(__dirname, '../dist/ygn-db-helper.zip');
  assert(fs.existsSync(zipPath), 'dist/ygn-db-helper.zip must exist');
  const zipStat = fs.statSync(zipPath);
  assert(zipStat.size > 2000, 'Packaged zip archive must have reasonable size');
  console.log(`  ✓ dist/ygn-db-helper.zip verified (${(zipStat.size / 1024).toFixed(1)} KB).`);

  console.log('\n>>> ALL WEBEXTENSION TESTS PASSED SUCCESSFULLY! <<<');
}

testWebExtension();
