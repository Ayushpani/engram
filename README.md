<div align="center">
  <img src="apps/web/public/logo.png" width="500" alt="Smaran Logo" />
  
  <br />
  <br />

  <p>
    <b>The Intelligent Memory Backend for AI Agents</b>
  </p>
  
  <p>
    <a href="https://smaran.ai"><img src="https://img.shields.io/badge/Website-smaran.ai-orange.svg" alt="Website" /></a>
    <a href="https://github.com/Ayushpani/engram/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Proprietary-blue.svg" alt="License" /></a>
    <img src="https://img.shields.io/badge/Status-Closed_Beta-success.svg" alt="Beta" />
    <img src="https://img.shields.io/badge/Platform-Cloudflare_Edge-orange.svg" alt="Platform" />
  </p>
</div>

---

## 🧠 What is Smaran?

Smaran is a state-of-the-art memory infrastructure layer designed from the ground up for AI agents. It acts as the ultimate long-term memory engine for agents like **Claude Desktop**, **Cursor**, and custom LLM workflows, allowing them to instantly recall your knowledge with perfect context.

Traditional Retrieval-Augmented Generation (RAG) systems suffer from "context bloat"—repeated facts, messy data, and degraded LLM reasoning. **Smaran solves this.** 

When you plug Smaran into your agent, it acts as a hyper-intelligent brain: intercepting raw context, filtering duplicates mathematically on the client side, and executing millisecond edge-side reranking before serving only the highest-quality, distilled facts back to the LLM.

---

## ✨ Core Features

*   **⚡ Edge Reranking via Cloudflare Workers AI**: Employs a blazing-fast Cross-Encoder (`@cf/baai/bge-reranker-base`) directly at the network edge, ensuring low-latency intelligence routing.
*   **🛡️ Client-Side WASM Deduplication**: Filters exact and near-exact duplicates *before* network transport using an ultra-fast WebAssembly port of the `all-MiniLM-L6-v2` model.
*   **🕸️ Graph-Based Consolidation**: Uses the Louvain Modularity algorithm compiled to WASM to detect dense clusters in your memory space, automatically synthesizing messy notes into unified facts.
*   **🔌 Universal MCP Integration**: Connects effortlessly to Claude Desktop via the standard Model Context Protocol (MCP).

---

## 🚀 Getting Started

### 1. Get an API Key (Closed Beta)
Smaran is currently in a strict closed beta to ensure we provide a premium, high-quality onboarding experience. 

👉 **[Join the waitlist at smaran.ai](https://smaran.ai)** to request access. We review every request personally and will email you an API key if you're a good fit.

### 2. Test the Edge Reranker Locally (No API Key Required)
If you want to witness the power of our Cloudflare Edge Reranker right now without an API key, we have provided a mocked End-to-End test script. This script intercepts a core API call, mocks 50 messy baseline memories, and pipes them directly to the live Smaran Edge Reranker Worker.

```bash
# 1. Install dependencies across the monorepo
bun install

# 2. Run the E2E test script
cd apps/mcp
bun run test-mcp-e2e.ts
```

*Watch your terminal as the Cloudflare Worker rescues the target memory from the absolute bottom of the pile (position 43) all the way up to position 1.*

### 3. Connect to Claude Desktop (Requires API Key)
Once you have secured your API key, you can give Claude Desktop a perfect memory using our Model Context Protocol (MCP) server.

1. **Start the local MCP server:**
   ```bash
   cd apps/mcp
   npx wrangler dev --port 8788
   ```

2. **Configure Claude Desktop:**
   Open your Claude configuration file (`claude_desktop_config.json`) and register the Smaran server:
   ```json
   {
     "mcpServers": {
       "smaran": {
         "command": "npx",
         "args": ["@modelcontextprotocol/inspector", "http://127.0.0.1:8788/mcp"]
       }
     }
   }
   ```
   *(Note: Because OAuth proxying is currently limited in some MCP clients, manual authentication via the inspector may be required on your first run.)*

---

## 🏗️ Architecture & Repository Structure

Smaran is built as a high-performance **Turbo Monorepo**, separating core math engines, cloud infrastructure, and client applications.

### 🌐 Applications (`apps/`)
*   **`web`**: The primary Smaran dashboard and landing page (Next.js).
*   **`mcp`**: The Model Context Protocol server, deployed on Cloudflare Workers for global low latency.
*   **`reranker-worker`**: The specialized Cloudflare Worker executing the BAAI Cross-Encoder model.
*   **`browser-extension` & `raycast-extension`**: Frontend tools for capturing context directly into your Smaran graph.

### 📦 Core Packages (`packages/`)
*   **`client-dedup-wasm`**: Rust-compiled WebAssembly engine for zero-latency client-side duplication filtering.
*   **`memory-consolidator`**: Rust-compiled Louvain Modularity engine for graph clustering.
*   **`benchmark`**: Automated testing harness for evaluating RAG retrieval accuracy.
*   **`tools`**: Built-in integrations for Slack, Notion, Google Drive, and OneDrive.

---

## 🛠️ Manual Build Instructions

If you are contributing to the core mathematical WASM packages, you will need to compile them manually:

1. **Install the Rust Toolchain** (Ensure the `wasm32-unknown-unknown` target is installed).
2. **Build the WASM packages:**
   ```bash
   cd packages/wasm-math
   wasm-pack build --target bundler --release

   cd ../memory-consolidator
   wasm-pack build --target bundler --release
   ```

---

## 📄 License & Copyright

Smaran is proprietary software. All rights reserved.
For inquiries, contact [ayush@smaran.ai](mailto:ayush@smaran.ai).
