import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

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
    // Example: Initialize MCP client with stdio transport
    // You can configure this to connect to your specific MCP server
    const transport = new StdioClientTransport({
      command: process.env.MCP_SERVER_COMMAND || "node",
      args: process.env.MCP_SERVER_ARGS?.split(",") || [],
    });

    mcpClient = new Client(
      {
        name: "gemini-mcp-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    await mcpClient.connect(transport);
    return mcpClient;
  } catch (error) {
    console.warn("MCP client initialization failed:", error);
    return null;
  }
}

// Convert MCP tools to Gemini function declarations
async function getMCPTools() {
  try {
    const client = await initializeMCPClient();
    if (!client) return [];

    const toolsList = await client.listTools();

    return toolsList.tools.map((tool) => ({
      name: tool.name,
      description: tool.description || "",
      parameters: tool.inputSchema || {
        type: "object",
        properties: {},
      },
    }));
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
      model: "gemini-2.0-flash-exp",
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
