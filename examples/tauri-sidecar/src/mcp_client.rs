use anyhow::{anyhow, bail, Context, Result};
use reqwest::Client;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicU64, Ordering};

pub struct McpClient {
    endpoint: String,
    client: Client,
    next_id: AtomicU64,
}

impl McpClient {
    pub fn new(endpoint: String) -> Self {
        Self {
            endpoint,
            client: Client::new(),
            next_id: AtomicU64::new(1),
        }
    }

    pub async fn initialize(&self) -> Result<()> {
        let _ = self
            .call(
                "initialize",
                json!({
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": { "name": "rust-sidecar-demo", "version": "0.1.0" }
                }),
            )
            .await?;
        Ok(())
    }

    pub async fn tools_list(&self) -> Result<Vec<Value>> {
        let result = self.call("tools/list", json!({})).await?;
        let tools = result
            .get("tools")
            .and_then(Value::as_array)
            .ok_or_else(|| anyhow!("tools/list response missing tools array"))?;
        Ok(tools.clone())
    }

    pub async fn create_session(&self, shell: &str, autorun: &str) -> Result<String> {
        let result = self
            .call(
                "tools/call",
                json!({
                    "name": "terminal.create_session",
                    "arguments": { "shell": shell, "autorun": autorun }
                }),
            )
            .await?;
        let payload = parse_tool_payload(&result)?;
        payload
            .get("session_id")
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| anyhow!("create_session response missing session_id"))
    }

    pub async fn read_output(&self, session_id: &str, strip_ansi: bool) -> Result<Vec<String>> {
        let result = self
            .call(
                "tools/call",
                json!({
                    "name": "terminal.read_output",
                    "arguments": { "session_id": session_id, "strip_ansi": strip_ansi }
                }),
            )
            .await?;
        let payload = parse_tool_payload(&result)?;
        let lines = payload
            .get("lines")
            .and_then(Value::as_array)
            .ok_or_else(|| anyhow!("read_output response missing lines array"))?;
        Ok(lines
            .iter()
            .map(|line| line.as_str().unwrap_or_default().to_string())
            .collect())
    }

    pub async fn kill(&self, session_id: &str, signal: &str) -> Result<()> {
        let _ = self
            .call(
                "tools/call",
                json!({
                    "name": "terminal.kill",
                    "arguments": { "session_id": session_id, "signal": signal }
                }),
            )
            .await?;
        Ok(())
    }

    async fn call(&self, method: &str, params: Value) -> Result<Value> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let req = jsonrpc_request(id, method, params);
        let resp = self
            .client
            .post(&self.endpoint)
            .header("content-type", "application/json")
            .header("accept", "application/json, text/event-stream")
            .json(&req)
            .send()
            .await
            .context("HTTP POST failed")?;
        let status = resp.status();
        let content_type = resp
            .headers()
            .get("content-type")
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .to_string();
        let body_text = resp.text().await.context("HTTP response body read failed")?;
        let body = parse_http_body(&content_type, &body_text)?;
        if !status.is_success() {
            bail!("HTTP {status}: {body}");
        }
        if let Some(error) = body.get("error") {
            bail!("JSON-RPC error: {error}");
        }
        body.get("result")
            .cloned()
            .ok_or_else(|| anyhow!("JSON-RPC response missing result: {body}"))
    }
}

pub fn jsonrpc_request(id: u64, method: &str, params: Value) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params
    })
}

fn parse_http_body(content_type: &str, body: &str) -> Result<Value> {
    if content_type.contains("text/event-stream") {
        let data = body
            .lines()
            .filter_map(|line| line.strip_prefix("data:"))
            .map(str::trim)
            .find(|line| !line.is_empty())
            .ok_or_else(|| anyhow!("SSE response missing data frame: {body}"))?;
        return serde_json::from_str(data).context("SSE data frame was not JSON");
    }

    serde_json::from_str(body).context("HTTP response was not JSON")
}

fn parse_tool_payload(result: &Value) -> Result<Value> {
    if result.get("isError").and_then(Value::as_bool) == Some(true) {
        let message = result
            .get("content")
            .and_then(Value::as_array)
            .and_then(|content| content.first())
            .and_then(|block| block.get("text"))
            .and_then(Value::as_str)
            .unwrap_or("tool returned isError");
        bail!("{message}");
    }

    if let Some(structured) = result.get("structuredContent") {
        return Ok(structured.clone());
    }

    let text = result
        .get("content")
        .and_then(Value::as_array)
        .and_then(|content| content.first())
        .and_then(|block| block.get("text"))
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow!("tool result missing content text"))?;
    serde_json::from_str(text).context("tool content text was not JSON")
}

#[cfg(test)]
mod tests {
    use super::jsonrpc_request;
    use serde_json::json;

    #[test]
    fn builds_jsonrpc_request_shape() {
        let req = jsonrpc_request(7, "tools/list", json!({}));

        assert_eq!(req["jsonrpc"], "2.0");
        assert_eq!(req["id"], 7);
        assert_eq!(req["method"], "tools/list");
        assert_eq!(req["params"], json!({}));
    }

    #[test]
    fn parses_sse_jsonrpc_body() {
        let body = "event: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{}}\n\n";
        let parsed = super::parse_http_body("text/event-stream", body).expect("SSE body should parse");

        assert_eq!(parsed["result"], json!({}));
    }
}
