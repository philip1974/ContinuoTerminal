#[path = "../src/mcp_client.rs"]
mod mcp_client;
#[path = "../src/sidecar.rs"]
mod sidecar;

use std::path::PathBuf;
use std::process::Command;
use tokio::time::{sleep, Duration};

fn node_and_bin_available() -> bool {
    let node_ok = Command::new("which")
        .arg("node")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false);
    if !node_ok {
        return false;
    }
    let manifest = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR must exist");
    PathBuf::from(manifest)
        .join("../../packages/server-node/src/bin.mjs")
        .exists()
}

async fn skip_if_missing() -> bool {
    if node_and_bin_available() {
        return false;
    }
    eprintln!("[skip] node or sidecar bin.mjs not available; E2E skipped");
    true
}

#[tokio::test]
async fn e2e_full_demo_or_skip() {
    if skip_if_missing().await {
        return;
    }

    let sidecar = sidecar::Sidecar::spawn().await.expect("sidecar should spawn");
    let client = mcp_client::McpClient::new(sidecar.endpoint().clone());

    client.initialize().await.expect("initialize should succeed");
    let tools = client.tools_list().await.expect("tools/list should succeed");
    // server-node advertises 8 terminal.* tools; assert the name set (not just a
    // bare count) so a future tool rename/add can't hide behind the number.
    assert_eq!(tools.len(), 8);
    assert!(
        tools.iter().any(|tool| tool["name"] == "terminal.resize"),
        "tools/list should include terminal.resize",
    );

    let session_id = client
        .create_session("/bin/bash", "echo from-rust-sidecar; sleep 1")
        .await
        .expect("create_session should succeed");
    sleep(Duration::from_millis(800)).await;
    let lines = client
        .read_output(&session_id, true)
        .await
        .expect("read_output should succeed");
    assert!(lines.iter().any(|line| line.contains("from-rust-sidecar")));
    client
        .kill(&session_id, "SIGTERM")
        .await
        .expect("kill should succeed");

    drop(sidecar);
}

#[tokio::test]
async fn cleanup_idempotent_under_normal_drop() {
    if skip_if_missing().await {
        return;
    }

    let sidecar = sidecar::Sidecar::spawn().await.expect("sidecar should spawn");
    let pid = sidecar.pid().expect("sidecar pid should exist");
    drop(sidecar);

    assert!(sidecar::wait_until_pid_exits(pid).await);
}

#[tokio::test]
async fn cleanup_under_error_returns_no_orphan() {
    if skip_if_missing().await {
        return;
    }

    let sidecar = sidecar::Sidecar::spawn().await.expect("sidecar should spawn");
    let pid = sidecar.pid().expect("sidecar pid should exist");
    let client = mcp_client::McpClient::new(sidecar.endpoint().clone());
    client.initialize().await.expect("initialize should succeed");

    let failed = client.read_output("missing-session", true).await;
    assert!(failed.is_err());
    drop(sidecar);

    assert!(sidecar::wait_until_pid_exits(pid).await);
}
