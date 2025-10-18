# Gemini Chat with MCP

A minimal chat UI powered by Google Gemini with Model Context Protocol (MCP) support. This allows Gemini to interact with MCP servers and execute tool calls.

## Features

- 🤖 **Gemini 2.0 Flash** - Latest Google AI model
- 🔧 **MCP Integration** - Connect to Model Context Protocol servers
- 💬 **Clean UI** - Minimal, modern chat interface built with Next.js and Tailwind CSS
- ⚡ **Function Calling** - Gemini can call tools from connected MCP servers

## Getting Started

### Prerequisites

- Node.js 18+ installed
- A Google Gemini API key ([Get one here](https://makersuite.google.com/app/apikey))

### Installation

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Create a `.env.local` file in the root directory:

**Option A: Local MCP Server (Python/Node)**
```bash
GEMINI_API_KEY=your_gemini_api_key_here

# Local Python MCP Server (e.g., FPL MCP Server)
MCP_SERVER_COMMAND=python
MCP_SERVER_ARGS=-m,fpl_mcp_server

# Or with direct path
# MCP_SERVER_ARGS=/path/to/your/mcp-server/main.py

# Or Node.js server
# MCP_SERVER_COMMAND=node
# MCP_SERVER_ARGS=path/to/your/mcp-server.js
```

**Option B: OP.GG MCP API (Remote)**
```bash
GEMINI_API_KEY=your_gemini_api_key_here

# OPGG MCP Server URL (for OP.GG esports data)
OPGG_MCP_URL=https://mcp-api.op.gg/mcp
```

**Option C: Use Multiple MCP Servers (Recommended!)**
```bash
GEMINI_API_KEY=your_gemini_api_key_here

# FPL MCP Server for Fantasy Premier League data
FPL_MCP_COMMAND=python3.12
FPL_MCP_ARGS=-m,fpl_mcp

# NBA MCP Server for basketball data
NBA_MCP_COMMAND=python3.12
NBA_MCP_ARGS=-m,nba_mcp_server

# Optional: OP.GG for esports data
# OPGG_MCP_URL=https://mcp-api.op.gg/mcp

# Optional: Cloudbet for betting odds
# CLOUDBET_MCP_URL=http://localhost:8080
```

**Note:** You can enable **all servers** simultaneously! Gemini will have access to tools from all configured servers.

3. Run the development server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## How It Works

### Chat UI (`src/app/page.tsx`)

- Client-side React component with state management
- Sends messages to the `/api/chat` endpoint
- Displays conversation history with user and assistant messages
- Loading states with animated dots

### API Route (`src/app/api/chat/route.ts`)

The API route handles:

1. **Message Processing** - Receives chat messages from the UI
2. **MCP Connection** - Connects to configured MCP servers via stdio transport
3. **Tool Discovery** - Fetches available tools from MCP servers
4. **Gemini Integration** - Sends messages to Gemini with available tools
5. **Function Calling** - Executes MCP tools when Gemini calls them
6. **Response Handling** - Returns the final response to the UI

### MCP Server Configuration

#### Option 1: OPGG MCP Server (Recommended for OP.GG Esports Data)

The easiest way to access OP.GG esports data is via URL:

```bash
OPGG_MCP_URL=https://your-opgg-mcp-server-url.com
```

This will connect to the OPGG MCP server via SSE (Server-Sent Events) and give Gemini access to esports data like:
- Player statistics
- Match history
- Tournament information
- Team rankings
- And more!

#### Option 2: Local MCP Server (stdio)

To connect your own local MCP server:

1. Set `MCP_SERVER_COMMAND` to the command that runs your server
2. Set `MCP_SERVER_ARGS` to comma-separated arguments (if needed)

Example for a Node.js MCP server:

```bash
MCP_SERVER_COMMAND=node
MCP_SERVER_ARGS=./mcp-server/index.js
```

Example for a Python MCP server:

```bash
MCP_SERVER_COMMAND=python
MCP_SERVER_ARGS=-m,your_mcp_server
```

## Architecture

```
┌─────────────┐      HTTP POST      ┌──────────────┐
│             │ ──────────────────> │              │
│   Chat UI   │                     │  /api/chat   │
│  (React)    │ <────────────────── │    Route     │
│             │      JSON Response  │              │
└─────────────┘                     └──────┬───────┘
                                           │
                                           │ SDK Calls
                                           │
                        ┌──────────────────┴──────────────────┐
                        │                                     │
                  ┌─────▼─────┐                      ┌────────▼────────┐
                  │           │                      │                 │
                  │  Gemini   │  Function Calls      │   MCP Server    │
                  │    API    │ ──────────────────>  │   (Optional)    │
                  │           │                      │                 │
                  └───────────┘                      └─────────────────┘
```

## Example Usage

1. **Simple Chat**: Just type a message and Gemini will respond
2. **With MCP Tools**: If an MCP server is configured, Gemini can automatically call tools to help answer your questions

Example conversation:
```
User: What's the weather like today?
Gemini: [If weather MCP tool is available, calls it and returns the result]
```

## Technologies Used

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **@google/generative-ai** - Gemini API SDK
- **@modelcontextprotocol/sdk** - MCP client library

## Troubleshooting

- **"GEMINI_API_KEY is not configured"**: Make sure you've created a `.env.local` file with your API key
- **MCP connection errors**: Check your MCP server configuration and ensure the server is accessible
- **Function calling not working**: Verify your MCP server implements the correct protocol and exposes tools properly

## License

MIT
