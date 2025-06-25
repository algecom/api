type MCPConfig = { type: "app" } | { type: "business", user_uid: string, business_uid: string };

type Resource = {
  uri: string;
  name: string;
  get: () => Promise<{ parts: GeminiPart[] }>;
};

// Gemini API Request Types
type GeminiRequestBody = {
  contents: GeminiContent[];
  tools?: GeminiTool[];
  toolConfig?: GeminiToolConfig;
  safetySettings?: GeminiSafetySetting[];
  systemInstruction?: GeminiContent;
  generationConfig?: GeminiGenerationConfig;
}

type GeminiContent = {
  parts: GeminiPart[];
  role?: "user" | "model" | "system";
}

type GeminiPart = {
  text?: string;
  functionCall?: {
    name: string;
    args?: Record<string, any>;
  };
  functionResponse?: {
    name: string;
    response: Record<string, any>;
  };
  fileData?: {
    mimeType: string;
    fileUri: string;
  };
  inlineData?: {
    mimeType: string;
    data: string; // base64 encoded
  };
};

type GeminiTool = {
  functionDeclarations: GeminiFunctionDeclaration[];
  codeExecution: (args: any) => Promise<any>;
}

type GeminiFunctionDeclaration = {
  name: string;
  description: string;
  parameters?: GeminiSchema;
}

type GeminiSchema = {
  type: "object" | "array" | "string" | "number" | "integer" | "boolean";
  properties?: Record<string, GeminiSchema>;
  items?: GeminiSchema;
  required?: string[];
  enum?: any[];
  description?: string;
}

type GeminiToolConfig = {
  functionCallingConfig?: {
    mode?: "AUTO" | "ANY" | "NONE";
    allowedFunctionNames?: string[];
  };
}

type GeminiSafetySetting = {
  category: "HARM_CATEGORY_HARASSMENT" | "HARM_CATEGORY_HATE_SPEECH" | "HARM_CATEGORY_SEXUALLY_EXPLICIT" | "HARM_CATEGORY_DANGEROUS_CONTENT";
  threshold: "BLOCK_NONE" | "BLOCK_ONLY_HIGH" | "BLOCK_MEDIUM_AND_ABOVE" | "BLOCK_LOW_AND_ABOVE";
}

type GeminiGenerationConfig = {
  stopSequences?: string[];
  responseMimeType?: string;
  responseSchema?: GeminiSchema;
  candidateCount?: number;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
}

// Gemini API Response Types
type GeminiResponse = {
  candidates?: GeminiCandidate[];
  promptFeedback?: GeminiPromptFeedback;
  usageMetadata?: GeminiUsageMetadata;
}

type GeminiCandidate = {
  content?: GeminiContent;
  finishReason?: "FINISH_REASON_UNSPECIFIED" | "STOP" | "MAX_TOKENS" | "SAFETY" | "RECITATION" | "OTHER";
  index?: number;
  safetyRatings?: GeminiSafetyRating[];
}

type GeminiPromptFeedback = {
  blockReason?: "BLOCKED_REASON_UNSPECIFIED" | "SAFETY" | "OTHER";
  safetyRatings?: GeminiSafetyRating[];
}

type GeminiSafetyRating = {
  category: "HARM_CATEGORY_HARASSMENT" | "HARM_CATEGORY_HATE_SPEECH" | "HARM_CATEGORY_SEXUALLY_EXPLICIT" | "HARM_CATEGORY_DANGEROUS_CONTENT";
  probability: "HARM_PROBABILITY_UNSPECIFIED" | "NEGLIGIBLE" | "LOW" | "MEDIUM" | "HIGH";
}

type GeminiUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export type {
  MCPConfig,
  Resource,
  GeminiRequestBody,
  GeminiContent,
  GeminiPart,
  GeminiTool,
  GeminiFunctionDeclaration,
  GeminiSchema,
  GeminiToolConfig,
  GeminiSafetySetting,
  GeminiGenerationConfig,
  GeminiResponse,
  GeminiCandidate,
  GeminiPromptFeedback,
  GeminiSafetyRating,
  GeminiUsageMetadata,
};