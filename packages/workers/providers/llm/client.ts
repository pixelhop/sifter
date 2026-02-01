/**
 * LLM Client
 * Unified client for making LLM API calls via OpenRouter or OpenAI
 */

import type {
  LLMProvider,
  LLMClientConfig,
  LLMCompletionOptions,
  LLMCompletionResult,
} from "./types";
import { getProviderModelName } from "./types";

interface OpenAIAPIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const PROVIDER_URLS: Record<LLMProvider, string> = {
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
};

export class LLMClient {
  private config: LLMClientConfig;
  private defaultModel: string;

  constructor(config: LLMClientConfig) {
    this.config = config;
    this.defaultModel = config.defaultModel || "gpt-5-mini";
  }

  /**
   * Create chat completion
   */
  async complete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const model = options.model || this.defaultModel;

    try {
      return await this.callProvider(this.config.provider, model, options);
    } catch (error) {
      // Fallback to OpenAI if configured and primary provider failed
      if (
        this.config.fallbackToOpenAI &&
        this.config.provider === "openrouter" &&
        this.config.openaiApiKey
      ) {
        console.warn(
          `OpenRouter request failed, falling back to OpenAI: ${error}`
        );
        return await this.callProvider("openai", model, options, true);
      }
      throw error;
    }
  }

  private async callProvider(
    provider: LLMProvider,
    model: string,
    options: LLMCompletionOptions,
    isFallback = false
  ): Promise<LLMCompletionResult> {
    const url = PROVIDER_URLS[provider];
    const apiKey =
      isFallback && this.config.openaiApiKey
        ? this.config.openaiApiKey
        : this.config.apiKey;

    const providerModel = getProviderModelName(model, provider);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };

    // Add OpenRouter-specific headers
    if (provider === "openrouter") {
      headers["HTTP-Referer"] =
        this.config.httpReferer || "https://sifter.app";
      headers["X-Title"] = this.config.appName || "Sifter";
    }

    const body: Record<string, unknown> = {
      model: providerModel,
      messages: options.messages,
    };

    // Skip temperature for models that don't support it (gpt-5-mini only accepts temperature=1)
    if (options.temperature !== undefined && model !== "gpt-5-mini") {
      body.temperature = options.temperature;
    }

    if (options.maxTokens !== undefined) {
      body.max_completion_tokens = options.maxTokens;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `${provider} API error: ${response.status} - ${errorText}`
      );
    }

    const data: OpenAIAPIResponse = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error(`No content in ${provider} response`);
    }

    return {
      content,
      model: data.model,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
      provider: isFallback ? "openai" : provider,
    };
  }

  /**
   * Get the current provider
   */
  getProvider(): LLMProvider {
    return this.config.provider;
  }

  /**
   * Get the default model
   */
  getDefaultModel(): string {
    return this.defaultModel;
  }
}

/**
 * Create an LLM client from environment configuration
 */
export function createLLMClient(overrides?: Partial<LLMClientConfig>): LLMClient {
  const provider = (process.env.LLM_PROVIDER as LLMProvider) || "openai";

  let apiKey: string;
  if (provider === "openrouter") {
    apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "";
  } else {
    apiKey = process.env.OPENAI_API_KEY || "";
  }

  if (!apiKey) {
    throw new Error(
      provider === "openrouter"
        ? "OPENROUTER_API_KEY or OPENAI_API_KEY is required"
        : "OPENAI_API_KEY is required"
    );
  }

  const config: LLMClientConfig = {
    provider,
    apiKey,
    defaultModel: process.env.DEFAULT_LLM_MODEL || "gpt-5-mini",
    httpReferer: process.env.OPENROUTER_HTTP_REFERER || "https://sifter.app",
    appName: process.env.OPENROUTER_APP_NAME || "Sifter",
    fallbackToOpenAI: process.env.LLM_FALLBACK_TO_OPENAI === "true",
    openaiApiKey: process.env.OPENAI_API_KEY,
    ...overrides,
  };

  return new LLMClient(config);
}

// Singleton instance for reuse
let _llmClient: LLMClient | null = null;

/**
 * Get or create the LLM client singleton
 * Uses Nitro runtime config for settings
 */
export function useLLMClient(): LLMClient {
  if (_llmClient) {
    return _llmClient;
  }

  _llmClient = createLLMClient();
  return _llmClient;
}

/**
 * Reset the LLM client singleton (useful for testing)
 */
export function resetLLMClient(): void {
  _llmClient = null;
}
