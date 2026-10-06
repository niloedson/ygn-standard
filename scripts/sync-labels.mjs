#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const labelsFile = path.join(rootDir, '.github', 'labels.yml');

function parseSimpleYamlLabels(content) {
  const labels = [];
  let currentLabel = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- name:')) {
      if (currentLabel && currentLabel.name) {
        labels.push(currentLabel);
      }
      currentLabel = {
        name: trimmed.replace(/^- name:\s*["']?([^"']+)["']?$/, '$1').trim()
      };
    } else if (currentLabel) {
      if (trimmed.startsWith('color:')) {
        currentLabel.color = trimmed.replace(/^color:\s*["']?([^"']+)["']?$/, '$1').replace('#', '').trim();
      } else if (trimmed.startsWith('description:')) {
        currentLabel.description = trimmed.replace(/^description:\s*["']?([^"']*)["']?$/, '$1').trim();
      }
    }
  }

  if (currentLabel && currentLabel.name) {
    labels.push(currentLabel);
  }

  return labels;
}

function getRepoSlug() {
  try {
    const gitRemote = execFileSync('git', ['remote', 'get-url', 'origin'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    const match = gitRemote.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i);
    if (match) {
      return `${match[1]}/${match[2]}`;
    }
  } catch {
    // Ignore fallback
  }
  return 'niloedson/ygn-standard';
}

async function syncViaApi(token, labels) {
  const repo = getRepoSlug();
  console.log(`Using GitHub REST API for repository "${repo}"...`);
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'ygn-label-syncer'
  };

  let successCount = 0;
  for (const label of labels) {
    const url = `https://api.github.com/repos/${repo}/labels`;
    const body = {
      name: label.name,
      color: label.color,
      description: label.description || ''
    };

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (res.status === 201) {
      console.log(`✓ Created: ${label.name}`);
      successCount++;
    } else if (res.status === 422) {
      // Label already exists, update it
      const patchUrl = `${url}/${encodeURIComponent(label.name)}`;
      const patchRes = await fetch(patchUrl, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body)
      });
      if (patchRes.ok) {
        console.log(`✓ Updated: ${label.name}`);
        successCount++;
      } else {
        const errorText = await patchRes.text();
        console.warn(`! Failed to update "${label.name}":`, errorText);
      }
    } else {
      const errorText = await res.text();
      console.warn(`! Failed to create "${label.name}":`, errorText);
    }
  }

  console.log(`\nLabel synchronization complete: ${successCount}/${labels.length} labels configured.`);
}

function syncViaGhCli(labels) {
  console.log(`Using GitHub CLI (\`gh\`) to synchronize labels...`);
  let successCount = 0;

  for (const label of labels) {
    const args = ['label', 'create', label.name, '--force'];
    if (label.color) {
      args.push('--color', label.color);
    }
    if (label.description) {
      args.push('--description', label.description);
    }

    try {
      execFileSync('gh', args, { stdio: 'pipe', encoding: 'utf-8' });
      console.log(`✓ Synced: ${label.name}`);
      successCount++;
    } catch (err) {
      console.warn(`! Failed to sync label "${label.name}":`, err.stderr ? err.stderr.trim() : err.message);
    }
  }

  console.log(`\nLabel synchronization complete: ${successCount}/${labels.length} labels configured.`);
}

async function run() {
  if (!fs.existsSync(labelsFile)) {
    console.error(`Labels configuration not found at ${labelsFile}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(labelsFile, 'utf-8');
  const labels = parseSimpleYamlLabels(fileContent);

  console.log(`Loaded ${labels.length} labels from .github/labels.yml.`);

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    await syncViaApi(token, labels);
    return;
  }

  const checkGh = spawnSync('gh', ['--version'], { encoding: 'utf-8' });
  if (!checkGh.error && checkGh.status === 0) {
    syncViaGhCli(labels);
    return;
  }

  console.error('\nError: Neither GitHub CLI (`gh`) nor a GitHub Token (GH_TOKEN/GITHUB_TOKEN) was found.');
  console.error('\nTo synchronize labels directly from your machine:');
  console.error('  Option 1 (GitHub CLI): Install `gh` (https://cli.github.com/) and run `gh auth login`.');
  console.error('  Option 2 (Token): Set GH_TOKEN environment variable with repo label permissions and re-run.');
  console.error('  Option 3 (Automated CI): Push changes to main and .github/workflows/labels.yml will sync automatically.\n');
  process.exit(1);
}

run();
