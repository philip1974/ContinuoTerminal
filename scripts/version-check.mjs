#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CT_PACKAGES = ['protocol', 'host', 'server-node', 'react-terminal'];

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function gatherCTVersions() {
  const v = {};
  for (const pkg of CT_PACKAGES) {
    const j = readJson(path.join(REPO_ROOT, 'packages', pkg, 'package.json'));
    v[pkg] = j?.version ?? 'unknown';
  }
  return v;
}

function resolveConsumer(name, envVar, defaultRel) {
  const overridden = process.env[envVar];
  const candidates = [];
  if (overridden) candidates.push({ path: overridden, source: `$${envVar}` });
  candidates.push({ path: path.resolve(REPO_ROOT, defaultRel), source: 'sibling-default' });
  for (const c of candidates) {
    if (existsSync(c.path)) return { ...c, found: true };
  }
  return { found: false, searched: candidates, name };
}

function scanConsumerFileRefs(consumerRoot) {
  const pj = readJson(path.join(consumerRoot, 'package.json'));
  if (!pj) return [];
  const refs = [];
  const allDeps = { ...pj.dependencies, ...pj.devDependencies, ...pj.optionalDependencies };
  for (const [name, spec] of Object.entries(allDeps || {})) {
    if (typeof spec === 'string' && spec.startsWith('file:')) {
      refs.push({ name, spec, consumer_version: pj.version });
    }
  }
  return refs;
}

(async () => {
  const ctVersions = gatherCTVersions();
  console.log('=== ContinuoTerminal versions ===');
  for (const [k, v] of Object.entries(ctVersions)) console.log(`  packages/${k}: ${v}`);

  const consumers = [
    { name: 'Continuo', envVar: 'CONTINUO_REPO_PATH', defaultRel: '../Continuo' },
    { name: 'AiQ', envVar: 'AIQ_REPO_PATH', defaultRel: '../AiQ' },
  ];

  console.log('\n=== Consumer cross-repo file: dep map ===');
  for (const c of consumers) {
    const r = resolveConsumer(c.name, c.envVar, c.defaultRel);
    if (!r.found) {
      console.log(
        `\n${c.name}: skipped (searched ${r.searched
          .map((s) => `${s.path} (${s.source})`)
          .join('; ')}; set ${c.envVar} to override)`,
      );
      continue;
    }
    const refs = scanConsumerFileRefs(r.path);
    console.log(`\n${c.name} @ ${r.path} (via ${r.source})`);
    if (refs.length === 0) {
      console.log('  (no file: deps referencing ContinuoTerminal)');
    } else {
      console.log('  | dep | spec | consumer pkg version |');
      for (const ref of refs) {
        console.log(`  | ${ref.name} | ${ref.spec} | ${ref.consumer_version} |`);
      }
    }
  }

  console.log('\n(version:check is advisory only — always exits 0 per ADR 0008 N7)');
  process.exit(0);
})();
