import type { MCPConfig, GeminiTool, GeminiPart, GeminiContent, GeminiResponse, GeminiCandidate, GeminiRequestBody } from "./types";
import BusinessService from "../business";
import * as fs from 'fs/promises';
import path from 'path';
import BaseApiClient from "../../plugins/baseApiClient";
import type { MessageResponse } from "../business/types";
import type { Order } from "../googleApi/types";

class MCPService extends BaseApiClient {
  tools: GeminiTool[];
  conversation: GeminiContent[];
  conversationId: string;
  config: MCPConfig;
  business: string;
  customer: string;
  total_token_count: number;

  constructor(config: MCPConfig, conversation: GeminiContent[], conversationId?: string, business: string = "", customer: string = "") {
    super();
    this.config = config;
    this.conversation = conversation;
    this.conversationId = conversationId || "";
    this.business = business;
    this.customer = customer;
    this.total_token_count = 0;
    this.tools = [
      {
        functionDeclarations: [
          {
            name: "checkInventory",
            description: "Check the inventory of the business",
            parameters: { type: "object", properties: {}, required: [] }
          }
        ],
        codeExecution: async () => {
          const businessService = new BusinessService();
          const products = this.config.type == "business" ? await businessService.getProducts(this.config.user_uid!, this.config.business_uid!) : [];
          return products;
        }
      },
      {
        functionDeclarations: [
          {
            name: "checkOrders",
            description: "Check the orders of the business",
            parameters: { type: "object", properties: {}, required: [] }
          }
        ],
        codeExecution: async () => {
          const businessService = new BusinessService();
          const orders = this.config.type == "business" ? await businessService.getOrders(this.config.user_uid!, this.config.business_uid!) : [];
          return orders;
        }
      }, 
      {
        functionDeclarations: [
          {
            name: "placeOrder",
            description: "Place an order for a product",
            parameters: { 
              type: "object", 
              properties: { 
                productName: { type: "string" }, 
                quantity: { type: "number" },
                fullname: { type: "string" },
                phone: { type: "string" },
                address: { type: "string" },
                note: { type: "string" }
              }, 
              required: ["productName", "quantity", "fullname", "phone", "address", "note"] 
            }
          }
        ],
        codeExecution: async (args: Order) => {
          console.dir({
            ...args,
            conversation: this.conversationId ? "https://fb.com/messenger/t/" + this.conversationId : ""
          }, { depth: null });
          const businessService = new BusinessService();
          const orders = this.config.type == "business" ? await businessService.placeOrder(this.config.user_uid!, this.config.business_uid!, 
            {
              ...args,
              conversation: this.conversationId ? "https://fb.com/messenger/t/" + this.conversationId : "-",
              note: "-"
            }
          ) : [];
          console.dir({ orders }, { depth: null });
          return orders;
        }
      }
    ];
  }

  private async getSystemPrompt(): Promise<string> {
    try {
      if (this.config.type == "business") {
        const systemPromptPath = path.join(__dirname, 'system-prompt.txt');
        const business = await fs.readFile(systemPromptPath, 'utf-8');
        return business.trim();
      } 
      else return process.env.APP_INFORMATION || "";
    } catch (error) {
      console.error('Error reading system prompt file:', error);
      return "";
    }
  }

  private async executeTool(name: string, args: any) {
    const tool = this.tools.find(tool => tool.functionDeclarations?.some(declaration => declaration.name === name));
    if (!tool) throw new Error(`MCP error -32602: Tool ${ name } not found`);
    return await tool.codeExecution(args);
  }

  private async callGeminiFunction(candidates: GeminiCandidate[]): Promise<GeminiPart> {
    let reCallGemini: boolean = false;
    let results: GeminiPart[] = [];
    let functionConversation: GeminiContent[] = [];

    // console.dir({ candidates }, { depth: null });

    for (const candidate of candidates) {
      if (candidate.content?.parts) {
        for (const part of candidate.content.parts) {
          results.push(part);
          if (part.functionCall) {
            reCallGemini = true;
            functionConversation.push({ role: "model", parts: [ part ] });
            const toolResult = await this.executeTool(part.functionCall.name, part.functionCall.args);
            functionConversation.push({ role: "model", parts: [ { functionResponse: { name: part.functionCall.name, response: toolResult } } ] });
          };
        }
      }
    }
    
    if (!results.length) throw new Error("No response from AI");

    if (reCallGemini) return await this.useGemini(functionConversation);
    else return results.reverse()[ 0 ] as GeminiPart;
  }

  async useGemini(functionConversation: GeminiContent[] = []): Promise<GeminiPart> {
    try {
      const request: GeminiRequestBody = { 
        contents: [ ...this.conversation, ...functionConversation ],
        systemInstruction: {
          role: "system",
          parts: [
            // { text: await this.getSystemPrompt() },
            { text: "You are a helpful seller assistant via Facebook Messenger." },
            { text: "Here are the business information: " + this.business },
            // { text: "Here are the customer information: " + this.customer }
          ]
        },
        tools: this.tools,
        generationConfig: {
          maxOutputTokens: 4096,
          temperature: 0.7,
        }
      };

      // console.dir({ request }, { depth: null });
      // console.dir({ contents: request.contents }, { depth: null });

      const response = await this.makeRequest<GeminiResponse>(
        `https://generativelanguage.googleapis.com/v1beta/models/${ process.env.GEMINI_MODEL }?key=${ process.env.GEMINI_API_KEY }`,
        {
          method: "POST",
          body: JSON.stringify(request),
        }
      );

      // console.dir({ response }, { depth: null });

      if (response.promptFeedback?.blockReason) throw new Error("Gemini API error: " + response.promptFeedback.blockReason);

      this.total_token_count += response.usageMetadata?.totalTokenCount || 0;
      const candidates = response.candidates;
      if (!candidates) throw new Error("No response from AI");

      return await this.callGeminiFunction(candidates || []);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async callAI(): Promise<MessageResponse> {
    const response = await this.useGemini();
    
    return {
      text: response.text || "",
      total_token_count: this.total_token_count
    };
  }
}

export default MCPService;