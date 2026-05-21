---
name: Bug report
about: Report a defect, regression, or unexpected behavior.
title: "bug: <one-line summary>"
labels: bug
---

## Summary

<!-- One or two sentences describing the bug. -->

## Reproduction steps

<!-- Minimal numbered steps that reproduce the issue. -->

1.
2.
3.

## Expected behavior

<!-- What did you expect to happen? -->

## Actual behavior

<!-- What happened instead? Paste error messages / stack traces in fenced blocks. -->

```
<!-- logs / stderr -->
```

## Environment

- OS + version (e.g. `macOS 15.0 (arm64)` / `Ubuntu 24.04 (x86_64)`):
- Node version (`node -v`):
- pnpm version (`pnpm -v`):
- Package(s) affected (e.g. `@continuo-terminal/server-node`,
  `examples/standalone-cli`):
- Commit / branch (`git rev-parse --short HEAD`):

## Additional context

<!--
Anything else that helps — recent changes, related PRs, links to the
audit trail under .claude/dev-loop/, screenshots, etc. If the bug
involves `node-pty`, please mention whether you tried
`pnpm rebuild node-pty --build-from-source`.
-->
