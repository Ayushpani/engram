# Engram: The Agentic Memory Engine

Engram is a state-of-the-art, high-performance memory infrastructure layer designed specifically for Artificial Intelligence agents and large language models (LLMs). While traditional Retrieval-Augmented Generation (RAG) systems treat memory as static, isolated chunks of text, Engram treats memory as a dynamic, interconnected graph that actively deduplicates, consolidates, and reranks context before it reaches the language model. 

This repository houses the complete monorepo for the Engram ecosystem, including the core API, Web UI, browser extensions, Model Context Protocol (MCP) servers, and the WebAssembly (WASM) mathematical engines that power its extreme performance.

## The Core Problem

Standard semantic search relies strictly on vector similarity (e.g., Cosine Similarity of dense embeddings). However, LLM agents require context, not just similarity. When an agent asks "What is my current role?", a traditional RAG system might return a document from three years ago stating "I am a junior developer" simply because it is semantically identical to the query, overriding a recent document stating "I am a senior engineering manager."

Furthermore, as agents operate autonomously over long periods, they ingest duplicate information. Storing and retrieving this duplicated context bloats the context window, increases token costs, and degrades reasoning performance.

## The Engram Solution

Engram solves these challenges through a three-tiered architecture:

1. **Client-Side WASM Deduplication**: Before data ever reaches the server, Engram filters out exact and near-exact duplicate memories natively in the browser or client environment using an ultra-fast WebAssembly port of the `all-MiniLM-L6-v2` quantization model. This prevents database bloat at the source.
2. **Graph-Based Memory Consolidation**: Periodically, an asynchronous worker reconstructs the entire user memory space into an undirected graph. Using the Louvain Modularity algorithm compiled to WASM (`memory-consolidator`), Engram detects dense clusters of highly related memories and uses an LLM to synthesize them into unified, high-density facts.
3. **Agentic Edge Reranking**: During retrieval, candidate documents from the Vector Database are intercepted at the Cloudflare Edge. We utilize Cloudflare Workers AI native bindings to execute a Cross-Encoder (`@cf/baai/bge-reranker-base`) on Cloudflare's serverless GPU infrastructure. This re-scores and re-orders documents to ensure the agent receives the most relevant context possible.

*(Note: While we maintain Rust/WASM crates for local inference, our production Edge Reranker currently leverages Cloudflare's native AI infrastructure to bypass WebAssembly memory limits and dynamic import restrictions).*

## Benchmarking

Engram includes a robust benchmark suite (`packages/benchmark`) designed to measure latency and test integration against the live Cloudflare Workers API. 

Our edge reranker currently achieves a p50 end-to-end latency of ~300ms over the internet (with internal Cloudflare GPU execution taking 60-150ms) when rescuing relevant documents from a simulated vector database. 

True end-to-end LongMemEval memory recall benchmarking (testing resistance against context poisoning, temporal degradation, and contradiction injection against real ingested memories) is scheduled for the next phase of development.

## Monorepo Architecture

This project is structured as a Turbo Monorepo using Bun for high-speed package management.

### Applications (`apps/`)
- **`web`**: The primary Next.js frontend and dashboard for managing memories.
- **`mcp`**: The Model Context Protocol (MCP) server running on Cloudflare Workers. This allows seamless connection to tools like Claude Desktop, Cursor, and OpenClaw.
- **`browser-extension`**: Chrome extension for capturing memory context directly from the web.
- **`raycast-extension`**: Desktop native integration for MacOS users.
- **`reranker-worker`**: The Cloudflare Worker that natively interfaces with Workers AI for edge-side memory reranking.

### Core Packages (`packages/`)
- **`client-dedup-wasm`**: Rust-based WASM package for fast cosine similarity and deduplication.
- **`memory-consolidator`**: Rust-based WASM package for Louvain graph clustering.
- **`benchmark`**: The test runner and dataset generator for API benchmarking.
- **`lib`**: Shared database schemas (Drizzle ORM) and utility functions.
- **`tools`**: Integrations and connector logic for third-party platforms.

## Third-Party Connectors and Integrations

Engram provides out-of-the-box support for ingesting memory from external platforms. The `/v3/connections` API facilitates authenticated ingestion pipelines for:
- Slack Workspaces
- Notion Databases
- Google Drive
- Microsoft OneDrive

### Model Context Protocol (MCP) Support
The included `apps/mcp` package runs a fully compliant MCP Server. This enables external AI platforms (such as Claude Code, Cursor, and custom local agents) to query the Engram memory graph directly over standard local transport protocols, turning Engram into a universal memory layer for any MCP-compliant agent.

## Deployment and Infrastructure

Engram is built for edge-native execution.
- **Compute**: Cloudflare Workers for ultra-low latency global routing.
- **AI Infrastructure**: Cloudflare Workers AI for cross-encoder reranking.
- **Database**: Hyperdrive connected to distributed PostgreSQL.
- **Vector Storage**: Cloudflare Vectorize for nearest-neighbor candidate generation.
- **State**: Cloudflare Durable Objects to manage concurrent memory consolidation streams.

## Getting Started

### Prerequisites
- Bun v1.3+
- Rust Toolchain (GNU target required for Windows environments: `wasm32-unknown-unknown`)
- Node.js v20+

### Installation
1. Clone the repository and install dependencies:
   ```bash
   bun install
   ```
2. Build the WASM mathematical packages:
   ```bash
   cd packages/wasm-math && wasm-pack build --target bundler --release
   cd ../memory-consolidator && wasm-pack build --target bundler --release
   ```
3. Start the development server:
   ```bash
   bun run dev
   ```

## License
Engram is proprietary software. All rights reserved.
