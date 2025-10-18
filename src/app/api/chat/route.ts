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

// Initialize MCP client (example with a simple server)
let mcpClient: Client | null = null;

async function initializeMCPClient() {
  if (mcpClient) return mcpClient;

  try {
    let transport;

    // Check if OPGG_MCP_URL is provided (URL-based connection)
    if (process.env.OPGG_MCP_URL) {
      const urlString = process.env.OPGG_MCP_URL;
      console.log("Attempting to connect to OPGG MCP server at:", urlString);

      // Try to parse the URL
      let mcpUrl: URL;
      try {
        mcpUrl = new URL(urlString);
      } catch (urlError) {
        console.error("Invalid OPGG_MCP_URL format:", urlError);
        throw new Error(
          `Invalid OPGG_MCP_URL: ${urlString}. Must be a valid URL (e.g., https://mcp-api.op.gg/mcp)`
        );
      }

      // Log the URL details for debugging
      console.log(
        "Parsed URL - Protocol:",
        mcpUrl.protocol,
        "Host:",
        mcpUrl.host,
        "Path:",
        mcpUrl.pathname
      );

      // Choose transport based on protocol and URL
      if (mcpUrl.protocol === "ws:" || mcpUrl.protocol === "wss:") {
        console.log("Using WebSocket transport");
        transport = new WebSocketClientTransport(mcpUrl);
      } else if (mcpUrl.pathname.includes("sse")) {
        console.log("Using SSE transport");
        transport = new SSEClientTransport(mcpUrl);
      } else {
        // Default to StreamableHTTP for HTTP/HTTPS endpoints
        // This is the most common for MCP APIs like OP.GG
        console.log(
          "Using StreamableHTTP transport (recommended for MCP APIs)"
        );
        transport = new StreamableHTTPClientTransport(mcpUrl);
      }
    }
    // Fall back to stdio transport if command is provided
    else if (process.env.MCP_SERVER_COMMAND) {
      console.log(
        "Using stdio transport with command:",
        process.env.MCP_SERVER_COMMAND
      );
      transport = new StdioClientTransport({
        command: process.env.MCP_SERVER_COMMAND,
        args: process.env.MCP_SERVER_ARGS?.split(",") || [],
      });
    } else {
      console.warn(
        "No MCP server configured (OPGG_MCP_URL or MCP_SERVER_COMMAND)"
      );
      return null;
    }

    mcpClient = new Client(
      {
        name: "gemini-opgg-mcp-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    console.log("Connecting to MCP transport...");
    await mcpClient.connect(transport);
    console.log("✅ Successfully connected to MCP server");

    // List available tools for debugging
    const tools = await mcpClient.listTools();
    console.log(
      `✅ MCP server has ${tools.tools.length} tools available:`,
      tools.tools.map((t) => t.name).join(", ")
    );

    return mcpClient;
  } catch (error: any) {
    console.error("❌ MCP client initialization failed:");
    console.error("Error type:", error.constructor.name);
    console.error("Error message:", error.message);

    if (error.code === 405) {
      console.error(
        "\n💡 TROUBLESHOOTING 405 ERROR:\n" +
          "The transport method might not match the server.\n" +
          "Current URL:",
        process.env.OPGG_MCP_URL,
        "\n" +
          "Try:\n" +
          "1. For OP.GG API: Use https://mcp-api.op.gg/mcp (StreamableHTTP)\n" +
          "2. For SSE endpoints: Use URLs ending with /sse\n" +
          "3. For WebSocket: Use ws:// or wss:// protocol"
      );
    } else if (error.message?.includes("Failed to fetch")) {
      console.error(
        "\n💡 NETWORK ERROR:\n" +
          "1. Check if the server is running and accessible\n" +
          "2. Verify CORS settings if connecting from browser\n" +
          "3. Check your network connection"
      );
    }

    return null;
  }
}

// Convert JSON Schema to Gemini Schema recursively
function convertSchema(schema: any): any {
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

// Convert MCP tools to Gemini function declarations
async function getMCPTools(): Promise<FunctionDeclaration[]> {
  try {
    const client = await initializeMCPClient();
    if (!client) return [];

    const toolsList = await client.listTools();

    return toolsList.tools.map((tool) => {
      const schema = tool.inputSchema as any;
      const convertedSchema = convertSchema(schema);

      return {
        name: tool.name,
        description: tool.description || "",
        parameters:
          convertedSchema.type === SchemaType.OBJECT
            ? convertedSchema
            : {
                type: SchemaType.OBJECT,
                properties: {},
              },
      } as FunctionDeclaration;
    });
  } catch (error) {
    console.warn("Failed to get MCP tools:", error);
    return [];
  }
}

// Execute MCP tool call
async function executeMCPTool(name: string, args: any) {
  try {
    const client = await initializeMCPClient();
    if (!client) {
      return { error: "MCP client not available" };
    }

    const result = await client.callTool({
      name,
      arguments: args,
    });

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
