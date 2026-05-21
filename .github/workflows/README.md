# workflows

GitHub Actions CI workflows for continuo-terminal monorepo.

## ci.yml

Triggered on `push` (any branch) and `pull_request` to `main`.

Matrix: macos-latest + ubuntu-latest, Node 24, pnpm 9.

Steps: checkout -> setup-pnpm -> setup-node (pnpm cache) -> diagnostics -> `pnpm install --frozen-lockfile` -> `pnpm typecheck` -> `pnpm test`.

Concurrency: cancel-in-progress per ref. Permissions: contents:read. Timeout: 20 min.
