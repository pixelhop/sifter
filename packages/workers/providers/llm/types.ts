/**
 * LLM Provider Types
 * Shared types for LLM client abstraction
 */

export type LLMProvider = "openrouter" | "openai";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  messages: LLMMessage[];
}

export interface LLMCompletionResult {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  provider: LLMProvider;
}

export interface LLMClientConfig {
  provider: LLMProvider;
  apiKey: string;
  defaultModel?: string;
  // OpenRouter-specific
  httpReferer?: string;
  appName?: string;
  // Fallback configuration
  fallbackToOpenAI?: boolean;
  openaiApiKey?: string;
}

/**
 * Model name mappings from simple names to provider-specific names
 */
export const MODEL_MAPPINGS: Record<string, Record<LLMProvider, string>> = {
  // GPT models
  "gpt-5-mini": {
    openrouter: "openai/gpt-5-mini",
    openai: "gpt-5-mini",
  },
  "gpt-5": {
    openrouter: "openai/gpt-5",
    openai: "gpt-5",
  },
  "gpt-4o": {
    openrouter: "openai/gpt-4o",
    openai: "gpt-4o",
  },
  "gpt-4o-mini": {
    openrouter: "openai/gpt-4o-mini",
    openai: "gpt-4o-mini",
  },
  "gpt-4-turbo": {
    openrouter: "openai/gpt-4-turbo",
    openai: "gpt-4-turbo",
  },
  // Claude models
  "claude-sonnet": {
    openrouter: "anthropic/claude-3.5-sonnet",
    openai: "claude-3-5-sonnet-20241022", // Not actually supported on OpenAI
  },
  "claude-3.5-sonnet": {
    openrouter: "anthropic/claude-3.5-sonnet",
    openai: "claude-3-5-sonnet-20241022",
  },
  "claude-opus": {
    openrouter: "anthropic/claude-3-opus",
    openai: "claude-3-opus-20240229",
  },
  "claude-haiku": {
    openrouter: "anthropic/claude-3-haiku",
    openai: "claude-3-haiku-20240307",
  },
  "claude-sonnet-4.5": {
    openrouter: "anthropic/claude-sonnet-4.5",
    openai: "claude-sonnet-4.5", // Not actually supported on OpenAI
  },
  // Full provider-prefixed names (passthrough)
  "openai/gpt-5-mini": {
    openrouter: "openai/gpt-5-mini",
    openai: "gpt-5-mini",
  },
  "openai/gpt-4o": {
    openrouter: "openai/gpt-4o",
    openai: "gpt-4o",
  },
  "anthropic/claude-3.5-sonnet": {
    openrouter: "anthropic/claude-3.5-sonnet",
    openai: "claude-3-5-sonnet-20241022",
  },
};

/**
 * Get the provider-specific model name
 */
export function getProviderModelName(
  model: string,
  provider: LLMProvider
): string {
  const mapping = MODEL_MAPPINGS[model];
  if (mapping) {
    return mapping[provider];
  }

  // If no mapping found, use as-is (already provider-specific)
  // For OpenRouter, prefix with openai/ if no provider prefix exists
  if (provider === "openrouter" && !model.includes("/")) {
    return `openai/${model}`;
  }

  // For OpenAI, strip provider prefix if present
  if (provider === "openai" && model.includes("/")) {
    return model.split("/").pop() || model;
  }

  return model;
}
