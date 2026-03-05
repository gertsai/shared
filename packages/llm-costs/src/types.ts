/**
 * @gerts/llm-costs — LLM Model Costs, Capabilities & Provider Registry
 *
 * Comprehensive model pricing database sourced from LiteLLM (2,600+ models, 100+ providers).
 * Prices stored in per-token format (native LiteLLM).
 * Use toPerMillion() / toPerToken() utilities for conversion.
 */

// ==================== Model Modes ====================

/** What the model does */
export type ModelMode =
  | 'chat'
  | 'embedding'
  | 'completion'
  | 'image_generation'
  | 'audio_transcription'
  | 'audio_speech'
  | 'rerank'
  | 'moderation'
  | 'responses'
  | 'video_generation'
  | 'image_edit'
  | 'search'
  | 'ocr'
  | 'vector_store';

// ==================== Token Pricing ====================

/**
 * Token-based pricing (cost per single token, USD).
 *
 * Example: GPT-4o input = 0.0000025 per token = $2.50 per million tokens.
 * Use `toPerMillion(price)` to convert for display.
 */
export interface TokenPricing {
  /** Input cost per token (USD) */
  input: number;
  /** Output cost per token (USD) */
  output: number;

  /** Reasoning output cost per token (o1, o3 models) */
  reasoningOutput?: number;

  // --- Cache pricing ---
  /** Cache read (hit) input cost per token */
  cacheRead?: number;
  /** Cache write (creation) input cost per token */
  cacheWrite?: number;
  /** Cache write cost after 1 hour (some providers increase price) */
  cacheWriteAfter1hr?: number;

  // --- Batch/Priority pricing ---
  /** Batch API input cost per token */
  batchInput?: number;
  /** Batch API output cost per token */
  batchOutput?: number;
  /** Priority input cost per token */
  priorityInput?: number;
  /** Priority output cost per token */
  priorityOutput?: number;

  // --- Audio token pricing ---
  /** Audio input token cost per token */
  audioInput?: number;
  /** Audio output token cost per token */
  audioOutput?: number;
}

/** Image-based pricing */
export interface ImagePricing {
  /** Cost per output image */
  outputPerImage?: number;
  /** Cost per input pixel */
  inputPerPixel?: number;
  /** Cost per input image */
  inputPerImage?: number;
  /** Cost per output image token */
  outputPerImageToken?: number;
}

/** Audio/Video time-based pricing */
export interface MediaPricing {
  /** Cost per second of audio input */
  audioInputPerSecond?: number;
  /** Cost per second of audio output */
  audioOutputPerSecond?: number;
  /** Cost per second of video input */
  videoInputPerSecond?: number;
  /** Cost per second of video output */
  videoOutputPerSecond?: number;
}

/** Rerank pricing */
export interface RerankPricing {
  /** Cost per rerank query */
  perQuery?: number;
}

/** Search pricing */
export interface SearchPricing {
  /** Cost per search query by context size */
  perQuery?: {
    low?: number;
    medium?: number;
    high?: number;
  };
}

// ==================== Model Capabilities ====================

/** What a model can do */
export interface ModelCapabilities {
  vision?: boolean;
  functionCalling?: boolean;
  parallelFunctionCalling?: boolean;
  responseSchema?: boolean;
  reasoning?: boolean;
  promptCaching?: boolean;
  systemMessages?: boolean;
  toolChoice?: boolean;
  pdfInput?: boolean;
  audioInput?: boolean;
  audioOutput?: boolean;
  videoInput?: boolean;
  webSearch?: boolean;
  computerUse?: boolean;
  assistantPrefill?: boolean;
  nativeStreaming?: boolean;
  serviceTier?: boolean;
  embeddingImageInput?: boolean;
}

// ==================== Model Info ====================

/** Complete model information */
export interface ModelInfo {
  /** Model identifier (e.g., "gpt-4o", "claude-3-5-sonnet-20241022") */
  id: string;
  /** LiteLLM provider identifier (e.g., "openai", "anthropic", "bedrock") */
  provider: string;
  /** What the model does */
  mode: ModelMode;

  // --- Context limits ---
  /** Maximum input tokens */
  maxInputTokens?: number;
  /** Maximum output tokens */
  maxOutputTokens?: number;

  // --- Pricing (per token) ---
  /** Token pricing (per single token, USD) */
  tokenPricing: TokenPricing;
  /** Image-specific pricing */
  imagePricing?: ImagePricing;
  /** Audio/Video time-based pricing */
  mediaPricing?: MediaPricing;
  /** Rerank-specific pricing */
  rerankPricing?: RerankPricing;
  /** Search-specific pricing */
  searchPricing?: SearchPricing;

  // --- Capabilities ---
  capabilities: ModelCapabilities;

  // --- Embedding specific ---
  /** Output vector dimensions (embedding models only) */
  outputVectorSize?: number;

  // --- Rerank specific ---
  /** Max document chunks per rerank query */
  maxDocumentChunks?: number;
  /** Max tokens per document chunk */
  maxTokensPerChunk?: number;
  /** Max query tokens for rerank */
  maxQueryTokens?: number;

  // --- Metadata ---
  /** Date when model becomes deprecated (YYYY-MM-DD) */
  deprecationDate?: string;
  /** Source URL for pricing data */
  source?: string;
  /** Tool use system prompt token overhead */
  toolUseSystemPromptTokens?: number;
}

// ==================== Provider Capabilities ====================

/** What endpoints a provider supports */
export interface ProviderEndpoints {
  /** /chat/completions (OpenAI-compatible) */
  chatCompletions: boolean;
  /** /messages (Anthropic-style) */
  messages: boolean;
  /** /responses (new OpenAI responses API) */
  responses: boolean;
  /** /embeddings */
  embeddings: boolean;
  /** /image/generations */
  imageGenerations: boolean;
  /** /audio/transcriptions */
  audioTranscriptions: boolean;
  /** /audio/speech */
  audioSpeech: boolean;
  /** /moderations */
  moderations: boolean;
  /** /batches */
  batches: boolean;
  /** /rerank */
  rerank: boolean;
}

/** Provider configuration and metadata */
export interface ProviderConfig {
  /** Display name */
  name: string;
  /** Provider key (used in LiteLLM model names) */
  key: string;
  /** Icon identifier for UI rendering (maps to frontend icon component) */
  icon?: string;
  /** Whether this is a first-party provider (direct API) vs aggregator */
  firstParty: boolean;
  /** Default base URL for API calls */
  baseUrl?: string;
  /** Provider website */
  website?: string;
  /** API keys management page */
  apiKeysPage?: string;
  /** Supported endpoints */
  endpoints: ProviderEndpoints;
  /** Health check endpoint path */
  healthCheckPath?: string;
  /** Models listing endpoint path (default: /v1/models) */
  modelsPath?: string;
  /** Embeddings endpoint path (default: /v1/embeddings) */
  embeddingsPath?: string;
  /** Rerank endpoint path (default: /v1/rerank) */
  rerankPath?: string;
}

// ==================== Lookup types ====================

/** Filter options for model listing */
export interface ModelFilter {
  /** Filter by provider (exact match or prefix) */
  provider?: string;
  /** Filter by mode */
  mode?: ModelMode;
  /** Filter by capability */
  capability?: keyof ModelCapabilities;
  /** Exclude deprecated models */
  excludeDeprecated?: boolean;
  /** Minimum context window size */
  minContextWindow?: number;
  /** Maximum input cost per token */
  maxInputCostPerToken?: number;
}

/** Cost calculation input */
export interface CostInput {
  /** Number of input tokens */
  inputTokens: number;
  /** Number of output tokens */
  outputTokens: number;
  /** Number of cached input tokens (read) */
  cachedTokens?: number;
  /** Number of reasoning output tokens */
  reasoningTokens?: number;
}

/** Cost calculation result */
export interface CostResult {
  /** Input cost in USD */
  inputCost: number;
  /** Output cost in USD */
  outputCost: number;
  /** Cache savings in USD (negative = savings) */
  cacheSavings: number;
  /** Reasoning cost in USD */
  reasoningCost: number;
  /** Total cost in USD */
  totalCost: number;
  /** Breakdown of pricing used */
  breakdown: {
    inputPerToken: number;
    outputPerToken: number;
    cacheReadPerToken?: number;
    reasoningPerToken?: number;
  };
}

// ==================== Conversion constants ====================

/** One million — for per-token ↔ per-million conversion */
export const ONE_MILLION = 1_000_000;
