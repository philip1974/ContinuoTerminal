// Package-metadata contract: every path listed in a workspace package's
// package.json `files` array must actually exist on disk.
//
// Polish (phase 2): @continuo-terminal/shell-quote declared README.md in `files`
// but shipped no README, so `npm pack` / publish / package review would silently
// omit the doc the metadata promised. This guards every package against that
// class of drift (a `files` entry that references a missing file/dir).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const packagesDir = path.join(repoRoot, 'packages');

const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(packagesDir, entry.name))
  .filter((dir) => existsSync(path.join(dir, 'package.json')));

describe('package.json `files` entries exist on disk', () => {
  for (const pkgDir of packageDirs) {
    const manifest = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) as {
      name?: string;
      files?: string[];
    };
    const files = manifest.files ?? [];
    const label = manifest.name ?? path.basename(pkgDir);

    it(`${label}: all ${files.length} files entries resolve`, () => {
      const missing = files.filter((entry) => !existsSync(path.join(pkgDir, entry)));
      expect(missing).toEqual([]);
    });
  }
});
