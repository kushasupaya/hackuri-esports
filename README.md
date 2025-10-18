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

```bash
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: Configure MCP server
MCP_SERVER_COMMAND=node
MCP_SERVER_ARGS=path/to/your/mcp-server.js
```

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

To connect your own MCP server:

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
