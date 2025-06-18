import * as readline from "node:readline/promises";
import { spawn } from "node:child_process";
import type { Tool, Resource, Content } from "./types";

async function mcp() {
  const serverProcess = spawn("bun", [ "v1/services/mcp/server.ts" ], { stdio: [ "pipe", "pipe", "inherit" ] });

  const rl = readline.createInterface({
    input: serverProcess.stdout,
    output: undefined,
  });

  async function callAI(messages: { role: string; content: string }[], tools: any[]) {
    // Convert messages to Gemini format - keep it simple
    const geminiMessages = messages.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.content }]
    }));
  
    const requestBody: any = {
      contents: geminiMessages,
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.7,
      }
    };
  
    if (tools.length > 0) {
      requestBody.tools = [{
        function_declarations: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          parameters: {
            type: "object",
            properties: tool.inputSchema.properties,
            required: Object.keys(tool.inputSchema.properties || {})
          }
        }))
      }];
    }
    
    // console.log("\n=== REQUEST ===");
    // console.dir(requestBody, { depth: null });
    // console.log("\n");
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${ process.env.GEMINI_API_KEY }`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );
  
    const data: any = await response.json();
  
    // console.log("=== RESPONSE ===");
    // console.dir(data, { depth: null });
    // console.log("\n");
    
    if (data.error) throw new Error("Gemini API error: " + data.error.message);
  
    const candidate = data.candidates?.[0];
    if (!candidate) throw new Error("No response from Gemini");
  
    // Convert Gemini response to simple format
    const result = {
      text: "",
      functionCall: null as any
    };
    
    for (const part of candidate.content.parts) {
      if (part.text) {
        result.text += part.text;
      }
      if (part.functionCall) {
        result.functionCall = {
          name: part.functionCall.name,
          args: part.functionCall.args || {}
        };
      }
    }
  
    return result;
  }

  let lastId = 0;
  async function send( method: string, params: object = {}, isNotification?: boolean) {
    serverProcess.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        method,
        params,
        id: isNotification ? undefined : lastId++,
      }) + "\n"
    );
    if (isNotification) return;
    const json = await rl.question("");
    console.log({ json });
    return JSON.parse(json).result;
  }

  const { serverInfo, capabilities } = await send("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "client", version: "0.1.0" },
  });

  await send("notifications/initialized", {}, true);

  const tools: Tool[] = capabilities.tools ? (await send("tools/list", { _meta: { progressToken: 1 } })).tools : [];
  const resources: Resource[] = capabilities.resources ? (await send("resources/list", { _meta: { progressToken: 1 } })).resources : [];

  const askAI = async (prompt: string) => {
    // Simple conversation history - just strings
    const conversation: { role: string; content: string }[] = [
      { role: "user", content: prompt }
    ];

    // First AI call
    const result = await callAI(conversation, tools);
    
    if (result.text) console.log(result.text);

    // If AI wants to call a function
    if (result.functionCall) {
      console.log(`🤖 Calling function: ${result.functionCall.name} with args: ${JSON.stringify(result.functionCall.args)}`);

      // Call the MCP tool
      const { content }: { content: Content[] } = await send("tools/call", {
        name: result.functionCall.name,
        arguments: result.functionCall.args,
      });

      // Add function call and result to conversation
      conversation.push({ role: "model", content: "Called function: " + result.functionCall.name });
      conversation.push({ role: "user", content: "Function result: " + (content?.[0]?.text || "No result") });

      // Get AI's final response
      const finalResult = await callAI(conversation, tools);
      if (finalResult.text) console.log(finalResult.text);
      return finalResult.text;
    }
  }

  return {
    tools,
    resources,
    askAI
  };
}

export { mcp };