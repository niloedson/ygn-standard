#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const rfcsDir = path.join(rootDir, 'rfcs');

const VALID_STATUSES = [
  'proposed',
  'draft',
  'proposed / draft',
  'in-review',
  'review',
  'fcp',
  'final comment period',
  'accepted',
  'implemented',
  'rejected',
  'withdrawn',
  'superseded'
];

const REQUIRED_HEADERS = [
  { key: 'RFC Number', regex: /\*\s*\*\*RFC Number:\*\*\s*(.+)/i },
  { key: 'Title', regex: /\*\s*\*\*Title:\*\*\s*(.+)/i },
  { key: 'Author(s)', regex: /\*\s*\*\*Author\(s\):\*\*\s*(.+)/i },
  { key: 'Status', regex: /\*\s*\*\*Status:\*\*\s*(.+)/i },
  { key: 'Type', regex: /\*\s*\*\*Type:\*\*\s*(.+)/i },
  { key: 'Created', regex: /\*\s*\*\*Created:\*\*\s*(.+)/i }
];

const REQUIRED_SECTIONS = [
  { name: 'Summary', regex: /^##\s+(\d+\.\s+)?Summary/im },
  { name: 'Motivation', regex: /^##\s+(\d+\.\s+)?Motivation/im },
  { name: 'Detailed Design / Specification', regex: /^##\s+(\d+\.\s+)?Detailed (Design|Specification)/im },
  { name: 'Drawbacks & Edge Cases', regex: /^##\s+(\d+\.\s+)?Drawbacks/im },
  { name: 'Prior Art & Alternatives', regex: /^##\s+(\d+\.\s+)?Prior Art/im },
  { name: 'Unresolved Questions', regex: /^##\s+(\d+\.\s+)?Unresolved Questions/im }
];

function lintRfcFile(filePath) {
  const fileName = path.basename(filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  const errors = [];
  const warnings = [];

  // 1. Check Header Metadata
  const headers = {};
  for (const { key, regex } of REQUIRED_HEADERS) {
    const match = content.match(regex);
    if (!match) {
      errors.push(`Missing required header: "* **${key}:**"`);
    } else {
      headers[key] = match[1].trim();
    }
  }

  // 2. Validate Status
  if (headers['Status']) {
    const normalizedStatus = headers['Status'].toLowerCase().trim();
    const isValid = VALID_STATUSES.some((s) => normalizedStatus.includes(s));
    if (!isValid) {
      errors.push(
        `Invalid Status "${headers['Status']}". Allowed values: Draft, In-Review, FCP, Accepted, Implemented, Rejected, Superseded.`
      );
    }
  }

  // 3. Check Required Sections
  for (const { name, regex } of REQUIRED_SECTIONS) {
    if (!regex.test(content)) {
      errors.push(`Missing required section: "${name}"`);
    }
  }

  return { fileName, errors, warnings };
}

function run() {
  if (!fs.existsSync(rfcsDir)) {
    console.error(`RFC directory does not exist: ${rfcsDir}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(rfcsDir)
    .filter((file) => file.endsWith('.md'))
    .filter((file) => file !== '0000-template.md' && file !== 'README.md');

  if (files.length === 0) {
    console.log('No RFC proposals to validate.');
    return;
  }

  console.log(`Auditing ${files.length} RFC file(s) in rfcs/...`);

  let totalErrors = 0;
  for (const file of files) {
    const filePath = path.join(rfcsDir, file);
    const { fileName, errors, warnings } = lintRfcFile(filePath);

    if (errors.length === 0) {
      console.log(`✓ ${fileName}: PASS`);
    } else {
      console.error(`✗ ${fileName}: ${errors.length} ERROR(S)`);
      for (const err of errors) {
        console.error(`   - ${err}`);
      }
      totalErrors += errors.length;
    }

    for (const warn of warnings) {
      console.warn(`   ! Warning: ${warn}`);
    }
  }

  if (totalErrors > 0) {
    console.error(`\nRFC linting failed with ${totalErrors} total error(s).`);
    process.exit(1);
  } else {
    console.log(`\nAll RFCs adhere to YGN governance standards.`);
  }
}

run();
