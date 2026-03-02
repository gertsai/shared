/**
 * Provider Registry — endpoint capabilities and configuration.
 *
 * Based on LiteLLM provider documentation + user-provided capabilities matrix.
 * Covers 100+ providers with endpoint support, health checks, and API key pages.
 */

import type { ProviderConfig, ProviderEndpoints } from './types';

/** Default: provider supports only chat completions */
const CHAT_ONLY: ProviderEndpoints = {
  chatCompletions: true,
  messages: true,
  responses: true,
  embeddings: false,
  imageGenerations: false,
  audioTranscriptions: false,
  audioSpeech: false,
  moderations: false,
  batches: false,
  rerank: false,
};

/** Full-featured provider endpoints */
const FULL: ProviderEndpoints = {
  chatCompletions: true,
  messages: true,
  responses: true,
  embeddings: true,
  imageGenerations: true,
  audioTranscriptions: true,
  audioSpeech: true,
  moderations: true,
  batches: true,
  rerank: false,
};

/**
 * Provider configurations with endpoint capabilities.
 *
 * Key providers with full metadata, remaining providers auto-detected from model data.
 */
export const PROVIDERS: Record<string, ProviderConfig> = {
  openai: {
    name: 'OpenAI',
    key: 'openai',
    firstParty: true,
    baseUrl: 'https://api.openai.com/v1',
    website: 'https://openai.com',
    apiKeysPage: 'https://platform.openai.com/api-keys',
    healthCheckPath: '/v1/models',
    endpoints: FULL,
  },
  anthropic: {
    name: 'Anthropic',
    key: 'anthropic',
    firstParty: true,
    baseUrl: 'https://api.anthropic.com',
    website: 'https://anthropic.com',
    apiKeysPage: 'https://console.anthropic.com/settings/keys',
    healthCheckPath: '/v1/messages',
    endpoints: {
      ...CHAT_ONLY,
      batches: true,
    },
  },
  azure: {
    name: 'Azure OpenAI',
    key: 'azure',
    firstParty: false,
    website: 'https://azure.microsoft.com/products/ai-services/openai-service',
    healthCheckPath: '/openai/deployments',
    endpoints: FULL,
  },
  azure_ai: {
    name: 'Azure AI',
    key: 'azure_ai',
    firstParty: false,
    website: 'https://ai.azure.com',
    endpoints: FULL,
  },
  bedrock: {
    name: 'AWS Bedrock',
    key: 'bedrock',
    firstParty: false,
    website: 'https://aws.amazon.com/bedrock',
    endpoints: {
      ...CHAT_ONLY,
      embeddings: true,
      rerank: true,
    },
  },
  vertex_ai: {
    name: 'Google Vertex AI',
    key: 'vertex_ai',
    firstParty: true,
    website: 'https://cloud.google.com/vertex-ai',
    endpoints: {
      ...CHAT_ONLY,
      embeddings: true,
      imageGenerations: true,
    },
  },
  gemini: {
    name: 'Google AI Studio (Gemini)',
    key: 'gemini',
    firstParty: true,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    website: 'https://ai.google.dev',
    apiKeysPage: 'https://aistudio.google.com/app/apikey',
    healthCheckPath: '/models',
    endpoints: CHAT_ONLY,
  },
  mistral: {
    name: 'Mistral AI',
    key: 'mistral',
    firstParty: true,
    baseUrl: 'https://api.mistral.ai/v1',
    website: 'https://mistral.ai',
    apiKeysPage: 'https://console.mistral.ai/api-keys',
    healthCheckPath: '/v1/models',
    endpoints: {
      ...CHAT_ONLY,
      embeddings: true,
    },
  },
  cohere: {
    name: 'Cohere',
    key: 'cohere',
    firstParty: true,
    baseUrl: 'https://api.cohere.ai/v1',
    website: 'https://cohere.com',
    apiKeysPage: 'https://dashboard.cohere.com/api-keys',
    endpoints: {
      ...CHAT_ONLY,
      embeddings: true,
      rerank: true,
    },
  },
  deepseek: {
    name: 'DeepSeek',
    key: 'deepseek',
    firstParty: true,
    baseUrl: 'https://api.deepseek.com',
    website: 'https://deepseek.com',
    apiKeysPage: 'https://platform.deepseek.com/api_keys',
    healthCheckPath: '/v1/models',
    endpoints: CHAT_ONLY,
  },
  groq: {
    name: 'Groq',
    key: 'groq',
    firstParty: true,
    baseUrl: 'https://api.groq.com/openai/v1',
    website: 'https://groq.com',
    apiKeysPage: 'https://console.groq.com/keys',
    healthCheckPath: '/v1/models',
    endpoints: CHAT_ONLY,
  },
  ollama: {
    name: 'Ollama',
    key: 'ollama',
    firstParty: false,
    baseUrl: 'http://localhost:11434',
    website: 'https://ollama.ai',
    healthCheckPath: '/api/tags',
    endpoints: {
      ...CHAT_ONLY,
      embeddings: true,
    },
  },
  together_ai: {
    name: 'Together AI',
    key: 'together_ai',
    firstParty: false,
    baseUrl: 'https://api.together.xyz/v1',
    website: 'https://together.ai',
    apiKeysPage: 'https://api.together.xyz/settings/api-keys',
    healthCheckPath: '/v1/models',
    endpoints: CHAT_ONLY,
  },
  fireworks_ai: {
    name: 'Fireworks AI',
    key: 'fireworks_ai',
    firstParty: false,
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    website: 'https://fireworks.ai',
    endpoints: CHAT_ONLY,
  },
  openrouter: {
    name: 'OpenRouter',
    key: 'openrouter',
    firstParty: false,
    baseUrl: 'https://openrouter.ai/api/v1',
    website: 'https://openrouter.ai',
    apiKeysPage: 'https://openrouter.ai/settings/keys',
    healthCheckPath: '/v1/models',
    endpoints: CHAT_ONLY,
  },
  xai: {
    name: 'xAI',
    key: 'xai',
    firstParty: true,
    baseUrl: 'https://api.x.ai/v1',
    website: 'https://x.ai',
    apiKeysPage: 'https://console.x.ai/',
    healthCheckPath: '/v1/models',
    endpoints: CHAT_ONLY,
  },
  perplexity: {
    name: 'Perplexity AI',
    key: 'perplexity',
    firstParty: true,
    baseUrl: 'https://api.perplexity.ai',
    website: 'https://perplexity.ai',
    endpoints: CHAT_ONLY,
  },
  cerebras: {
    name: 'Cerebras',
    key: 'cerebras',
    firstParty: true,
    baseUrl: 'https://api.cerebras.ai/v1',
    website: 'https://cerebras.ai',
    endpoints: CHAT_ONLY,
  },
  sambanova: {
    name: 'SambaNova',
    key: 'sambanova',
    firstParty: true,
    baseUrl: 'https://api.sambanova.ai/v1',
    website: 'https://sambanova.ai',
    endpoints: CHAT_ONLY,
  },
  deepinfra: {
    name: 'DeepInfra',
    key: 'deepinfra',
    firstParty: false,
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    website: 'https://deepinfra.com',
    endpoints: CHAT_ONLY,
  },
  infinity: {
    name: 'Infinity',
    key: 'infinity',
    firstParty: false,
    baseUrl: 'http://localhost:7997',
    website: 'https://github.com/michaelfeil/infinity',
    healthCheckPath: '/health',
    endpoints: {
      chatCompletions: false,
      messages: false,
      responses: false,
      embeddings: true,
      imageGenerations: false,
      audioTranscriptions: false,
      audioSpeech: false,
      moderations: false,
      batches: false,
      rerank: false,
    },
  },
  jina_ai: {
    name: 'Jina AI',
    key: 'jina_ai',
    firstParty: true,
    baseUrl: 'https://api.jina.ai/v1',
    website: 'https://jina.ai',
    endpoints: {
      chatCompletions: false,
      messages: false,
      responses: false,
      embeddings: true,
      imageGenerations: false,
      audioTranscriptions: false,
      audioSpeech: false,
      moderations: false,
      batches: false,
      rerank: false,
    },
  },
  voyage: {
    name: 'Voyage AI',
    key: 'voyage',
    firstParty: true,
    baseUrl: 'https://api.voyageai.com/v1',
    website: 'https://voyageai.com',
    endpoints: {
      chatCompletions: false,
      messages: false,
      responses: false,
      embeddings: true,
      imageGenerations: false,
      audioTranscriptions: false,
      audioSpeech: false,
      moderations: false,
      batches: false,
      rerank: false,
    },
  },
  vllm: {
    name: 'vLLM',
    key: 'vllm',
    firstParty: false,
    baseUrl: 'http://localhost:8000/v1',
    website: 'https://vllm.ai',
    healthCheckPath: '/health',
    endpoints: CHAT_ONLY,
  },
  litellm_proxy: {
    name: 'LiteLLM Proxy',
    key: 'litellm_proxy',
    firstParty: false,
    baseUrl: 'http://localhost:4000',
    website: 'https://litellm.ai',
    healthCheckPath: '/health/liveliness',
    endpoints: {
      ...CHAT_ONLY,
      embeddings: true,
      imageGenerations: true,
    },
  },
  huggingface: {
    name: 'Hugging Face',
    key: 'huggingface',
    firstParty: false,
    baseUrl: 'https://api-inference.huggingface.co',
    website: 'https://huggingface.co',
    apiKeysPage: 'https://huggingface.co/settings/tokens',
    endpoints: {
      ...CHAT_ONLY,
      embeddings: true,
      rerank: true,
    },
  },
  replicate: {
    name: 'Replicate',
    key: 'replicate',
    firstParty: false,
    baseUrl: 'https://api.replicate.com/v1',
    website: 'https://replicate.com',
    apiKeysPage: 'https://replicate.com/account/api-tokens',
    endpoints: CHAT_ONLY,
  },
  databricks: {
    name: 'Databricks',
    key: 'databricks',
    firstParty: false,
    website: 'https://databricks.com',
    endpoints: CHAT_ONLY,
  },
  nvidia_nim: {
    name: 'NVIDIA NIM',
    key: 'nvidia_nim',
    firstParty: false,
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    website: 'https://build.nvidia.com',
    endpoints: CHAT_ONLY,
  },
  meta_llama: {
    name: 'Meta Llama API',
    key: 'meta_llama',
    firstParty: true,
    website: 'https://llama.meta.com',
    endpoints: CHAT_ONLY,
  },
};

/** Common aliases: user-facing names → registry keys */
const PROVIDER_ALIASES: Record<string, string> = {
  google: 'gemini',
  google_ai: 'gemini',
  vertex: 'vertex_ai',
  aws: 'bedrock',
  nvidia: 'nvidia_nim',
  together: 'together_ai',
  fireworks: 'fireworks_ai',
  jina: 'jina_ai',
  hf: 'huggingface',
  litellm: 'litellm_proxy',
};

/**
 * Get provider config by key.
 * Supports aliases (e.g. "google" → "gemini") and compound keys
 * (e.g. "vertex_ai-language-models" → "vertex_ai").
 * Returns undefined for unknown providers (auto-detected from model data).
 */
export function getProvider(key: string): ProviderConfig | undefined {
  // 1. Direct match
  if (PROVIDERS[key]) return PROVIDERS[key];

  // 2. Try alias
  const aliased = PROVIDER_ALIASES[key];
  if (aliased && PROVIDERS[aliased]) return PROVIDERS[aliased];

  // 3. Normalize compound key: "vertex_ai-language-models" → "vertex_ai"
  const base = key.split('-')[0];
  return (
    PROVIDERS[base] ?? (PROVIDER_ALIASES[base] ? PROVIDERS[PROVIDER_ALIASES[base]] : undefined)
  );
}

/** Get all known provider configs */
export function getAllProviders(): ProviderConfig[] {
  return Object.values(PROVIDERS);
}

/** Get all provider keys */
export function getProviderKeys(): string[] {
  return Object.keys(PROVIDERS);
}
