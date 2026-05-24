# Engram: The Agentic Memory Engine

Engram is a state-of-the-art memory infrastructure layer for AI agents. It gives agents like Claude Desktop and Cursor persistent memory that automatically deduplicates, consolidates, and reranks context at the edge using Cloudflare GPU infrastructure.

If you are an agent developer, Engram acts as your agent's brain—intercepting messy context, filtering duplicates, and serving only the highest-quality, reranked context back to the LLM.

## Getting Started

### 1. Get an API Key (Closed Beta)
Engram is currently in closed beta to ensure high-quality onboarding. 
**[Join the waitlist at engram.ai](https://engram.ai)** to request access. We review every request manually and will email you an API key if you're a good fit.

### 2. Test the Reranker Locally (No API Key Required)
If you want to see the Edge Reranker in action right now without an API key, we have provided a mocked End-to-End test script. It intercepts the core API call, mocks 50 baseline memories, and pipes them directly to the live Cloudflare Edge Reranker Worker.

```bash
# Install dependencies
bun install

# Run the test
cd apps/mcp
bun run test-mcp-e2e.ts
```
Watch as the Cloudflare Worker rescues the target memory from the bottom of the pile (position 43) up to position 1.

### 3. Connect to Claude Desktop (Requires API Key)
Once you have your API key, you can connect Engram directly to Claude Desktop via the Model Context Protocol (MCP).

1. Start the local MCP server:
```bash
cd apps/mcp
npx wrangler dev --port 8788
```

2. Open your Claude Desktop configuration (`claude_desktop_config.json`) and add:
```json
{
  "mcpServers": {
    "engram": {
      "command": "npx",
      "args": ["@modelcontextprotocol/inspector", "http://127.0.0.1:8788/mcp"]
    }
  }
}
```
*Note: Because OAuth proxying is currently limited, manual authentication may be required in the inspector.*

---

## How It Works (Architecture)

Engram solves the "context bloat" problem of traditional RAG systems through a three-tiered architecture:

1. **Client-Side WASM Deduplication**: Before data ever reaches the server, Engram filters out exact and near-exact duplicate memories using an ultra-fast WebAssembly port of the `all-MiniLM-L6-v2` model (`client-dedup-wasm`).
2. **Graph-Based Memory Consolidation**: Periodically, the system reconstructs the user's memory space into an undirected graph. Using the Louvain Modularity algorithm compiled to WASM (`memory-consolidator`), Engram detects dense clusters and synthesizes them into unified facts.
3. **Agentic Edge Reranking**: During retrieval, candidate documents from the Vector Database are intercepted at the Cloudflare Edge. We execute a Cross-Encoder (`@cf/baai/bge-reranker-base`) on Cloudflare's serverless GPU infrastructure to re-score documents before returning them to the agent.

## Repository Structure (Turbo Monorepo)

### Applications (`apps/`)
- **`web`**: The primary frontend and dashboard (includes the Waitlist form).
- **`mcp`**: The Model Context Protocol (MCP) server running on Cloudflare Workers.
- **`reranker-worker`**: The Cloudflare Worker that interfaces with Workers AI for edge-side memory reranking.
- **`browser-extension` & `raycast-extension`**: Client capture tools.

### Core Packages (`packages/`)
- **`client-dedup-wasm` & `memory-consolidator`**: Rust-based WASM mathematical engines.
- **`benchmark`**: The test runner and dataset generator for API benchmarking.
- **`tools`**: Integrations for Slack, Notion, Google Drive, and OneDrive.

## Manual Build Instructions

If you are contributing to the core math packages:

1. Install Rust Toolchain (GNU target required for Windows: `wasm32-unknown-unknown`)
2. Build the WASM packages:
```bash
cd packages/wasm-math && wasm-pack build --target bundler --release
cd ../memory-consolidator && wasm-pack build --target bundler --release
```

## License
Engram is proprietary software. All rights reserved.
