use anyhow::Result;
use std::sync::Arc;
use tokio::sync::Mutex;

mod mcp_client;
mod sidecar;

type SidecarShared = Arc<Mutex<Option<sidecar::Sidecar>>>;

async fn cleanup_now(shared: &SidecarShared) {
    let mut guard = shared.lock().await;
    drop(guard.take());
}

#[tokio::main]
async fn main() -> Result<()> {
    println!("[host] starting");
    let sidecar = sidecar::Sidecar::spawn().await?;
    let endpoint = sidecar.endpoint().clone();
    println!("[sidecar] listening on {}", endpoint);

    let shared: SidecarShared = Arc::new(Mutex::new(Some(sidecar)));
    let panic_shared = shared.clone();
    let prev_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if let Ok(mut guard) = panic_shared.try_lock() {
            drop(guard.take());
        }
        prev_hook(info);
    }));

    let demo_shared = shared.clone();
    let signal_shared = shared.clone();
    tokio::select! {
        result = run_demo(endpoint.clone()) => {
            cleanup_now(&demo_shared).await;
            result?;
            println!("[host] demo complete");
        }
        _ = tokio::signal::ctrl_c() => {
            cleanup_now(&signal_shared).await;
            println!("[host] ctrl-c received; cleanup complete");
        }
    }

    Ok(())
}

async fn run_demo(endpoint: String) -> Result<()> {
    // CT-B2 demo runs the server-node M3 no-auth path. If future auth is
    // added here, never log Authorization header values; labels only.
    let client = mcp_client::McpClient::new(endpoint);
    client.initialize().await?;
    let tools = client.tools_list().await?;
    println!("[host] connected; tools/list returned {} tools", tools.len());

    let session_id = client
        .create_session("/bin/bash", "echo from-rust-sidecar; sleep 1")
        .await?;
    println!("[host] session-created:{}", session_id);

    tokio::time::sleep(std::time::Duration::from_millis(800)).await;

    let lines = client.read_output(&session_id, true).await?;
    println!("[host] secondary-output: {}", lines.join(" | "));

    client.kill(&session_id, "SIGTERM").await?;
    println!("[host] killed");

    Ok(())
}
