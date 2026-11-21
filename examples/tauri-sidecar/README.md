# tauri-sidecar — CT-B2 of ADR 0006

> **Source sidecar demo, not a production packaging recipe.**
> For production, follow the Tauri 2 sidecar docs and your app's bundle
> configuration: https://v2.tauri.app/develop/sidecar/

Rust binary demonstrating the sidecar pattern for consuming
`@continuo-terminal/server-node` from Rust. It validates the source-level
pattern a Tauri 2 desktop app can use when it wants a Rust-owned process to
spawn and supervise the terminal MCP server.

## What It Does

1. Spawns `continuo-terminal-server` as a child process in HTTP mode with an
   OS-assigned port.
2. Parses `continuo-terminal-server listening on http://127.0.0.1:<port>/mcp`
   to discover the endpoint.
3. Uses `reqwest` to send raw JSON-RPC POST requests with required Streamable
   HTTP headers:
   `Content-Type: application/json` and
   `Accept: application/json, text/event-stream`.
4. Runs `initialize`, `tools/list`, `terminal.create_session`,
   `terminal.read_output`, and `terminal.kill`.
5. Cleans up the sidecar on normal exit, panic, and Ctrl-C.

## Run

```bash
cd /path/to/ContinuoTerminal
pnpm install

cd examples/tauri-sidecar
cargo run
```

Expected output:

```text
[host] starting
[sidecar] listening on http://127.0.0.1:<port>/mcp
[host] connected; tools/list returned 7 tools
[host] session-created:<id>
[host] secondary-output: from-rust-sidecar
[host] killed
[host] demo complete
```

## Test

```bash
cargo test
```

E2E tests auto-skip only if Node or `packages/server-node/src/bin.mjs` is not
available. If the sidecar starts and the protocol flow fails, the test fails.

## Tauri 2 Integration Guide

### 1. Configure The Sidecar Binary

```json
{
  "bundle": {
    "externalBin": ["binaries/continuo-terminal-server"]
  }
}
```

See the Tauri docs for per-platform target triple naming conventions.

### 2. Add `tauri-plugin-shell`

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
```

```rust
use tauri_plugin_shell::{process::CommandEvent, ShellExt};

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      let (mut rx, child) = app
        .shell()
        .sidecar("continuo-terminal-server")
        .expect("sidecar binary missing")
        .args(["--transport", "http", "--host", "127.0.0.1", "--port", "0"])
        .spawn()
        .expect("failed to spawn sidecar");

      tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
          if let CommandEvent::Stdout(bytes) = event {
            let line = String::from_utf8_lossy(&bytes);
            // Parse the ready line and store endpoint + child in app state.
            println!("{line}");
          }
        }
      });

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running app");
}
```

### 3. Grant Shell Permission

`src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "permissions": [
    "shell:allow-spawn",
    "shell:allow-execute"
  ]
}
```

## Limitations

- macOS and Linux are the primary target for this source demo. Windows process
  cleanup is limited to the portable kill fallback.
- The demo uses the server-node no-auth HTTP path. Production multi-process
  scenarios should wire A2/A3 auth hooks through the host package.
- The bin path is resolved relative to `CARGO_MANIFEST_DIR`; this is for
  `cargo run` from source, not `cargo install`.
- `Cargo.lock` is committed because this is a binary example.

## ADR

See `docs/decisions/0006-local-transport-parity-tauri-sidecar.md`.
