#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const BASELINE_PATH = path.join(REPO_ROOT, 'scripts', 'leak-baseline.json');
const ADVISORY = process.argv.includes('--advisory');

const HARD_FORBIDDEN = [
  { pattern: /\bWebContents\b/, label: 'WebContents' },
  { pattern: /\bBrowserWindow\b/, label: 'BrowserWindow' },
  { pattern: /\bNSWindow\b/, label: 'NSWindow' },
  { pattern: /electron-store/, label: 'electron-store' },
  { pattern: /electron-builder/, label: 'electron-builder' },
  { pattern: /\bAiQ\b/, label: 'AiQ' },
  { pattern: /\baiq\b/, label: 'aiq' },
  { pattern: /\bAIQ\b/, label: 'AIQ' },
];

const SOFT_ALLOWLIST = [
  { pattern: /\bpanelId\b/, label: 'panelId' },
  { pattern: /\bwindowId\b/, label: 'windowId' },
  { pattern: /\bpanel\b/, label: 'panel' },
  { pattern: /\bTauri\b/, label: 'Tauri' },
  { pattern: /\bElectron\b/, label: 'Electron' },
  { pattern: /Continuo/, label: 'Continuo' },
];

async function walkSrc(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkSrc(p)));
    else if (e.isFile() && /\.(ts|tsx|js|mjs|cjs|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

async function gatherPackageSrcFiles() {
  const pkgRoot = path.join(REPO_ROOT, 'packages');
  const pkgs = await readdir(pkgRoot, { withFileTypes: true });
  const files = [];
  for (const p of pkgs) {
    if (!p.isDirectory()) continue;
    const srcDir = path.join(pkgRoot, p.name, 'src');
    try {
      files.push(...(await walkSrc(srcDir)));
    } catch {
      // package has no src/
    }
  }
  return files;
}

function scanFile(filePath, repoRel) {
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  const hardHits = [];
  const softHits = [];
  lines.forEach((line, idx) => {
    for (const { pattern, label } of HARD_FORBIDDEN) {
      if (pattern.test(line)) {
        hardHits.push({ file: repoRel, line: idx + 1, pattern: label, excerpt: line });
      }
    }
    for (const { pattern, label } of SOFT_ALLOWLIST) {
      if (pattern.test(line)) {
        softHits.push({ file: repoRel, line: idx + 1, pattern: label, excerpt: line });
      }
    }
  });
  return { hardHits, softHits };
}

function loadBaseline() {
  try {
    const raw = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
    return Array.isArray(raw) ? raw : raw.entries || [];
  } catch {
    return [];
  }
}

function isInBaseline(hit, baseline) {
  return baseline.some((b) => b.file === hit.file && b.excerpt.trim() === hit.excerpt.trim());
}

(async () => {
  const files = await gatherPackageSrcFiles();
  const allHard = [];
  const allSoft = [];
  for (const abs of files) {
    const rel = path.relative(REPO_ROOT, abs);
    const { hardHits, softHits } = scanFile(abs, rel);
    allHard.push(...hardHits);
    allSoft.push(...softHits);
  }

  const baseline = loadBaseline();
  const unbaselined = allSoft.filter((h) => !isInBaseline(h, baseline));
  const baselined = allSoft.length - unbaselined.length;

  const byPattern = {};
  for (const h of allSoft) byPattern[h.pattern] = (byPattern[h.pattern] || 0) + 1;
  const summary = Object.entries(byPattern)
    .map(([p, n]) => `${p}: ${n}`)
    .join(' / ');

  console.log(`leak:check scanned ${files.length} files in packages/*/src/`);
  console.log(`  hard-forbidden hits: ${allHard.length}`);
  console.log(
    `  soft-allowlist hits: ${allSoft.length} (${baselined} baselined / ${unbaselined.length} new)`,
  );
  if (summary) console.log(`  summary: ${summary}`);

  if (allHard.length > 0) {
    console.log('\n✗ leak:check FAIL — hard-forbidden hits:');
    for (const h of allHard) console.log(`  ${h.file}:${h.line}: [${h.pattern}] ${h.excerpt}`);
    process.exit(1);
  }

  if (unbaselined.length > 0) {
    if (ADVISORY) {
      console.log('\n⚠ leak:check WARN (--advisory) — unbaselined soft hits:');
      for (const h of unbaselined) {
        console.log(`  ${h.file}:${h.line}: [${h.pattern}] ${h.excerpt}`);
      }
      process.exit(0);
    }

    console.log('\n✗ leak:check FAIL (strict default) — unbaselined soft hits:');
    for (const h of unbaselined) {
      console.log(`  ${h.file}:${h.line}: [${h.pattern}] ${h.excerpt}`);
    }
    console.log(
      '\nTo accept these as compat references, add them to scripts/leak-baseline.json. To bypass for local dev, use: pnpm leak:check --advisory',
    );
    process.exit(1);
  }

  console.log(`\n✓ leak:check PASS — 0 hard-forbidden hits;${baselined} known compat hits per baseline`);
  process.exit(0);
})();
