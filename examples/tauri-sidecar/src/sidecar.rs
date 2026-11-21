use anyhow::{anyhow, bail, Context, Result};
use regex::Regex;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::time::timeout;

const KILL_GRACE_MS: u64 = 500;

pub struct Sidecar {
    child: Option<Child>,
    endpoint: String,
}

impl Sidecar {
    pub async fn spawn() -> Result<Self> {
        let bin_path = source_bin_path();
        if !bin_path.exists() {
            bail!("server bin not found: {}", bin_path.display());
        }

        let mut child = Command::new("node")
            .arg(&bin_path)
            .args(["--transport", "http", "--host", "127.0.0.1", "--port", "0"])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .with_context(|| format!("failed to spawn sidecar: {}", bin_path.display()))?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| anyhow!("sidecar stdout unavailable"))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| anyhow!("sidecar stderr unavailable"))?;
        let mut lines = BufReader::new(stdout).lines();

        let endpoint = timeout(Duration::from_secs(10), async {
            while let Some(line) = lines.next_line().await? {
                if let Some(endpoint) = parse_ready_line(&line) {
                    return Ok(endpoint);
                }
            }
            bail!("sidecar exited before ready line");
        })
        .await
        .context("timed out waiting for sidecar ready line")??;

        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[sidecar:stderr] {line}");
            }
        });

        Ok(Self {
            child: Some(child),
            endpoint,
        })
    }

    pub fn endpoint(&self) -> &String {
        &self.endpoint
    }

    #[allow(dead_code)]
    pub fn pid(&self) -> Option<u32> {
        self.child.as_ref().and_then(Child::id)
    }
}

impl Drop for Sidecar {
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
            #[cfg(unix)]
            {
                if let Some(pid) = child.id() {
                    let _ = nix::sys::signal::kill(
                        nix::unistd::Pid::from_raw(pid as i32),
                        nix::sys::signal::Signal::SIGTERM,
                    );
                }
                std::thread::sleep(Duration::from_millis(KILL_GRACE_MS));
            }

            let _ = child.start_kill();
        }
    }
}

pub fn source_bin_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packages/server-node/src/bin.mjs")
}

pub fn parse_ready_line(line: &str) -> Option<String> {
    // CT-B2 source demo only parses the current server-node IPv4/hostname line.
    // Future IPv6 support should widen this ready-line regex deliberately.
    let re = Regex::new(r"^continuo-terminal-server listening on (http://[\w\.\-]+:\d+/mcp)$")
        .expect("ready-line regex must compile");
    re.captures(line)
        .and_then(|captures| captures.get(1).map(|m| m.as_str().to_string()))
}

#[allow(dead_code)]
pub async fn pid_is_alive(pid: u32) -> bool {
    #[cfg(unix)]
    {
        nix::sys::signal::kill(nix::unistd::Pid::from_raw(pid as i32), None).is_ok()
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
        false
    }
}

#[allow(dead_code)]
pub async fn wait_until_pid_exits(pid: u32) -> bool {
    for _ in 0..10 {
        if !pid_is_alive(pid).await {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    !pid_is_alive(pid).await
}

#[cfg(test)]
mod tests {
    use super::parse_ready_line;

    #[test]
    fn parses_ready_line() {
        let line = "continuo-terminal-server listening on http://127.0.0.1:49231/mcp";
        assert_eq!(
            parse_ready_line(line).as_deref(),
            Some("http://127.0.0.1:49231/mcp")
        );
    }

    #[test]
    fn rejects_non_ready_lines() {
        assert!(parse_ready_line("hello http://127.0.0.1:1/mcp").is_none());
        assert!(parse_ready_line("continuo-terminal-server listening on https://127.0.0.1:1/mcp").is_none());
    }
}
