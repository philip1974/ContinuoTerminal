# docs

Project documentation for `continuo-terminal`.

- [Architecture](./architecture.md) — monorepo layers, package dependency
  graph, runtime flow.
- [Getting started](./getting-started.md) — prerequisites, install,
  typecheck, test, CLI demo, `react-terminal` adapter usage, and macOS
  `node-pty` troubleshooting.

- [Cross-platform support](./cross-platform-support.md).
- [`decisions/`](./decisions/) and [`proposals/`](./proposals/) — design
  records (ADRs) kept as written at the time. They cite the maintainer's local
  audit trails (`.claude/dev-loop/…`, not in this repository) and **AiQ**, the
  maintainer's private Tauri app that consumes these packages (also not
  public; `scripts/version-check.mjs` looks for it at `../AiQ` and skips when
  absent). Neither is needed to build, test, or contribute.

Per-package READMEs live under their respective directories
(`packages/*/README.md`, `examples/*/README.md`).
