import { NextRequest, NextResponse } from "next/server";
import {
  GoogleGenerativeAI,
  SchemaType,
  type FunctionDeclaration,
} from "@google/generative-ai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js";

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  messages: Message[];
}

// Store multiple MCP clients
let mcpClients: Map<string, Client> = new Map();

// Initialize a single MCP client
async function initializeSingleMCPClient(
  name: string,
  transport: any
): Promise<Client | null> {
  try {
    const client = new Client(
      {
        name: `gemini-mcp-${name}`,
        version: "1.0.0",
      },
      {
        capabilities: {
          // Minimal client capabilities - only what we actually support
          sampling: {},
        },
      }
    );

    console.log(`[${name}] Connecting to MCP transport...`);
    await client.connect(transport);
    console.log(`[${name}] ✅ Successfully connected`);

    // List available tools for debugging
    const tools = await client.listTools();
    console.log(
      `[${name}] ✅ ${tools.tools.length} tools available:`,
      tools.tools.map((t) => t.name).join(", ")
    );

    return client;
  } catch (error: any) {
    console.error(`[${name}] ❌ Connection failed:`, error);
    if (error.message) {
      console.error(`[${name}] Error details:`, error.message);
    }
    return null;
  }
}

// Initialize all configured MCP clients
async function initializeMCPClients() {
  if (mcpClients.size > 0) return mcpClients;

  console.log("\n🔧 Initializing MCP Clients...\n");

  try {
    // 1. FPL MCP Server (stdio)
    if (process.env.FPL_MCP_COMMAND) {
      console.log("Setting up FPL MCP Server (stdio)...");
      const transport = new StdioClientTransport({
        command: process.env.FPL_MCP_COMMAND,
        args: process.env.FPL_MCP_ARGS?.split(",") || [],
      });
      const client = await initializeSingleMCPClient("fpl", transport);
      if (client) mcpClients.set("fpl", client);
    }

    // 2. NBA MCP Server (stdio)
    // if (process.env.NBA_MCP_COMMAND) {
    //   console.log("Setting up NBA MCP Server (stdio)...");
    //   const transport = new StdioClientTransport({
    //     command: process.env.NBA_MCP_COMMAND,
    //     args: process.env.NBA_MCP_ARGS?.split(",") || [],
    //   });
    //   const client = await initializeSingleMCPClient("nba", transport);
    //   if (client) mcpClients.set("nba", client);
    // }

    // 3. OP.GG MCP Server (HTTP)
    if (process.env.OPGG_MCP_URL) {
      console.log("Setting up OP.GG MCP Server (HTTP)...");
      const urlString = process.env.OPGG_MCP_URL;
      const mcpUrl = new URL(urlString);

      let transport;
      if (mcpUrl.protocol === "ws:" || mcpUrl.protocol === "wss:") {
        transport = new WebSocketClientTransport(mcpUrl);
      } else if (mcpUrl.pathname.includes("sse")) {
        transport = new SSEClientTransport(mcpUrl);
      } else {
        transport = new StreamableHTTPClientTransport(mcpUrl);
      }

      const client = await initializeSingleMCPClient("opgg", transport);
      if (client) mcpClients.set("opgg", client);
    }

    if (mcpClients.size === 0) {
      console.warn(
        "⚠️  No MCP servers configured. Set at least one of:\n" +
          "  - FPL_MCP_COMMAND (for FPL)\n" +
          "  - NBA_MCP_COMMAND (for NBA)\n" +
          "  - OPGG_MCP_URL\n" +
          "  - CLOUDBET_MCP_URL"
      );
    } else {
      console.log(
        `\n✅ Successfully connected to ${mcpClients.size} MCP server(s)\n`
      );
    }

    return mcpClients;
  } catch (error: any) {
    console.error("❌ MCP client initialization failed:", error.message);
    return mcpClients;
  }
}

// Convert JSON Schema to Gemini Schema recursively
function convertSchema(schema: any): any {
  // console.log("schema", schema);
  if (!schema) return { type: SchemaType.STRING };

  if (schema.type === "object" && schema.properties) {
    const convertedProperties: any = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      convertedProperties[key] = convertSchema(value);
    }
    return {
      type: SchemaType.OBJECT,
      properties: convertedProperties,
      required: schema.required || [],
    };
  }

  if (schema.type === "array") {
    return {
      type: SchemaType.ARRAY,
      items: convertSchema(schema.items),
    };
  }

  // Map JSON Schema types to Gemini SchemaType
  const typeMap: { [key: string]: SchemaType } = {
    string: SchemaType.STRING,
    number: SchemaType.NUMBER,
    integer: SchemaType.INTEGER,
    boolean: SchemaType.BOOLEAN,
    object: SchemaType.OBJECT,
    array: SchemaType.ARRAY,
  };

  return {
    type: typeMap[schema.type] || SchemaType.STRING,
    description: schema.description,
  };
}

// Store tool -> client mapping for routing
const toolToClientMap = new Map<string, string>();

// Convert MCP tools from all clients to Gemini function declarations
async function getMCPTools(): Promise<FunctionDeclaration[]> {
  try {
    const clients = await initializeMCPClients();
    if (clients.size === 0) return [];

    const allTools: FunctionDeclaration[] = [];

    // Collect tools from all clients
    for (const [clientName, client] of clients.entries()) {
      try {
        const toolsList = await client.listTools();

        for (const tool of toolsList.tools) {
          // Map tool name to client for later routing
          toolToClientMap.set(tool.name, clientName);

          const schema = tool.inputSchema as any;
          const convertedSchema = convertSchema(schema);

          allTools.push({
            name: tool.name,
            description: `[${clientName.toUpperCase()}] ${
              tool.description || ""
            }`,
            parameters:
              convertedSchema.type === SchemaType.OBJECT
                ? convertedSchema
                : {
                    type: SchemaType.OBJECT,
                    properties: {},
                  },
          } as FunctionDeclaration);
        }
      } catch (error) {
        console.warn(`Failed to get tools from ${clientName}:`, error);
      }
    }

    return allTools;
  } catch (error) {
    console.warn("Failed to get MCP tools:", error);
    return [];
  }
}

// Execute MCP tool call by routing to the correct client
async function executeMCPTool(name: string, args: any) {
  try {
    const clientName = toolToClientMap.get(name);
    if (!clientName) {
      return { error: `Unknown tool: ${name}` };
    }

    const client = mcpClients.get(clientName);
    if (!client) {
      return { error: `Client ${clientName} not available` };
    }

    console.log(`Executing tool "${name}" on ${clientName} MCP server...`);
    const result = await client.callTool({
      name,
      arguments: args,
    });

    console.log(`Tool "${name}" executed successfully`);
    return result;
  } catch (error) {
    console.error("MCP tool execution error:", error);
    return { error: String(error) };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { messages }: ChatRequest = await request.json();

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages are required" },
        { status: 400 }
      );
    }

    // Check for API key
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured" },
        { status: 500 }
      );
    }

    // Get MCP tools
    const mcpTools = await getMCPTools();

    // Initialize Gemini model
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      tools:
        mcpTools.length > 0 ? [{ functionDeclarations: mcpTools }] : undefined,
    });

    // Convert messages to Gemini format
    const history = messages.slice(0, -1).map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    const chat = model.startChat({
      history,
    });

    // Get the last user message
    const lastMessage = messages[messages.length - 1].content;

    // Send message and handle potential function calls
    let result = await chat.sendMessage(lastMessage);
    let response = result.response;

    // Handle function calls (MCP tool calls)
    while (
      response.candidates?.[0]?.content?.parts?.some(
        (part: any) => part.functionCall
      )
    ) {
      const functionCall = response.candidates[0].content.parts.find(
        (part: any) => part.functionCall
      )?.functionCall;

      if (functionCall) {
        const toolResult = await executeMCPTool(
          functionCall.name,
          functionCall.args
        );

        // Send the function response back to Gemini
        result = await chat.sendMessage([
          {
            functionResponse: {
              name: functionCall.name,
              response: toolResult,
            },
          },
        ]);

        response = result.response;
      }
    }

    const text = response.text();

    return NextResponse.json({ message: text });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Failed to process chat request", details: String(error) },
      { status: 500 }
    );
  }
}
