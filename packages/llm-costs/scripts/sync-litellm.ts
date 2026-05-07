#!/usr/bin/env tsx
/**
 * Sync script: transforms LiteLLM model_prices_and_context_window.json
 * into @gertsai/llm-costs normalized format.
 *
 * Usage: pnpm --filter @gertsai/llm-costs sync
 * Source: sources/litellm/model_prices_and_context_window.json
 * Output: src/data/models.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');

const SOURCE = resolve(ROOT, 'sources/litellm/model_prices_and_context_window.json');
const OUTPUT = resolve(__dirname, '../src/data/models.json');

interface LiteLLMEntry {
  litellm_provider?: string;
  mode?: string;
  max_input_tokens?: number;
  max_output_tokens?: number;
  max_tokens?: number;
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  output_cost_per_reasoning_token?: number;
  cache_read_input_token_cost?: number;
  cache_creation_input_token_cost?: number;
  cache_creation_input_token_cost_above_1hr?: number;
  input_cost_per_token_batches?: number;
  output_cost_per_token_batches?: number;
  input_cost_per_token_priority?: number;
  output_cost_per_token_priority?: number;
  input_cost_per_audio_token?: number;
  output_cost_per_audio_token?: number;
  output_cost_per_image?: number;
  input_cost_per_pixel?: number;
  input_cost_per_image?: number;
  output_cost_per_image_token?: number;
  input_cost_per_audio_per_second?: number;
  output_cost_per_second?: number;
  input_cost_per_video_per_second?: number;
  output_cost_per_video_per_second?: number;
  input_cost_per_query?: number;
  search_context_cost_per_query?: {
    search_context_size_low?: number;
    search_context_size_medium?: number;
    search_context_size_high?: number;
  };
  output_vector_size?: number;
  max_document_chunks_per_query?: number;
  max_tokens_per_document_chunk?: number;
  max_query_tokens?: number;
  deprecation_date?: string;
  source?: string;
  tool_use_system_prompt_tokens?: number;
  supports_vision?: boolean;
  supports_function_calling?: boolean;
  supports_parallel_function_calling?: boolean;
  supports_response_schema?: boolean;
  supports_reasoning?: boolean;
  supports_prompt_caching?: boolean;
  supports_system_messages?: boolean;
  supports_tool_choice?: boolean;
  supports_pdf_input?: boolean;
  supports_audio_input?: boolean;
  supports_audio_output?: boolean;
  supports_video_input?: boolean;
  supports_web_search?: boolean;
  supports_computer_use?: boolean;
  supports_assistant_prefill?: boolean;
  supports_native_streaming?: boolean;
  supports_service_tier?: boolean;
  supports_embedding_image_input?: boolean;
  supports_image_input?: boolean;
  [key: string]: unknown;
}

interface OutputModel {
  id: string;
  provider: string;
  mode: string;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  tokenPricing: {
    input: number;
    output: number;
    reasoningOutput?: number;
    cacheRead?: number;
    cacheWrite?: number;
    cacheWriteAfter1hr?: number;
    batchInput?: number;
    batchOutput?: number;
    priorityInput?: number;
    priorityOutput?: number;
    audioInput?: number;
    audioOutput?: number;
  };
  imagePricing?: Record<string, number>;
  mediaPricing?: Record<string, number>;
  rerankPricing?: Record<string, number>;
  searchPricing?: { perQuery?: Record<string, number> };
  capabilities: Record<string, boolean>;
  outputVectorSize?: number;
  maxDocumentChunks?: number;
  maxTokensPerChunk?: number;
  maxQueryTokens?: number;
  deprecationDate?: string;
  source?: string;
  toolUseSystemPromptTokens?: number;
}

function transformEntry(id: string, entry: LiteLLMEntry): OutputModel | null {
  const provider = entry.litellm_provider;
  const mode = entry.mode;
  if (!provider || !mode) return null;

  // --- Token pricing ---
  const tokenPricing: OutputModel['tokenPricing'] = {
    input: entry.input_cost_per_token ?? 0,
    output: entry.output_cost_per_token ?? 0,
  };

  if (entry.output_cost_per_reasoning_token)
    tokenPricing.reasoningOutput = entry.output_cost_per_reasoning_token;
  if (entry.cache_read_input_token_cost) tokenPricing.cacheRead = entry.cache_read_input_token_cost;
  if (entry.cache_creation_input_token_cost)
    tokenPricing.cacheWrite = entry.cache_creation_input_token_cost;
  if (entry.cache_creation_input_token_cost_above_1hr)
    tokenPricing.cacheWriteAfter1hr = entry.cache_creation_input_token_cost_above_1hr;
  if (entry.input_cost_per_token_batches)
    tokenPricing.batchInput = entry.input_cost_per_token_batches;
  if (entry.output_cost_per_token_batches)
    tokenPricing.batchOutput = entry.output_cost_per_token_batches;
  if (entry.input_cost_per_token_priority)
    tokenPricing.priorityInput = entry.input_cost_per_token_priority;
  if (entry.output_cost_per_token_priority)
    tokenPricing.priorityOutput = entry.output_cost_per_token_priority;
  if (entry.input_cost_per_audio_token) tokenPricing.audioInput = entry.input_cost_per_audio_token;
  if (entry.output_cost_per_audio_token)
    tokenPricing.audioOutput = entry.output_cost_per_audio_token;

  // --- Image pricing ---
  let imagePricing: Record<string, number> | undefined;
  if (
    entry.output_cost_per_image ||
    entry.input_cost_per_pixel ||
    entry.input_cost_per_image ||
    entry.output_cost_per_image_token
  ) {
    imagePricing = {};
    if (entry.output_cost_per_image) imagePricing.outputPerImage = entry.output_cost_per_image;
    if (entry.input_cost_per_pixel) imagePricing.inputPerPixel = entry.input_cost_per_pixel;
    if (entry.input_cost_per_image) imagePricing.inputPerImage = entry.input_cost_per_image;
    if (entry.output_cost_per_image_token)
      imagePricing.outputPerImageToken = entry.output_cost_per_image_token;
  }

  // --- Media pricing ---
  let mediaPricing: Record<string, number> | undefined;
  if (
    entry.input_cost_per_audio_per_second ||
    entry.output_cost_per_second ||
    entry.input_cost_per_video_per_second ||
    entry.output_cost_per_video_per_second
  ) {
    mediaPricing = {};
    if (entry.input_cost_per_audio_per_second)
      mediaPricing.audioInputPerSecond = entry.input_cost_per_audio_per_second;
    if (entry.output_cost_per_second)
      mediaPricing.audioOutputPerSecond = entry.output_cost_per_second;
    if (entry.input_cost_per_video_per_second)
      mediaPricing.videoInputPerSecond = entry.input_cost_per_video_per_second;
    if (entry.output_cost_per_video_per_second)
      mediaPricing.videoOutputPerSecond = entry.output_cost_per_video_per_second;
  }

  // --- Rerank pricing ---
  let rerankPricing: Record<string, number> | undefined;
  if (entry.input_cost_per_query && mode === 'rerank') {
    rerankPricing = { perQuery: entry.input_cost_per_query };
  }

  // --- Search pricing ---
  let searchPricing: OutputModel['searchPricing'] | undefined;
  if (entry.search_context_cost_per_query) {
    const q = entry.search_context_cost_per_query;
    searchPricing = {
      perQuery: {
        ...(q.search_context_size_low != null && { low: q.search_context_size_low }),
        ...(q.search_context_size_medium != null && { medium: q.search_context_size_medium }),
        ...(q.search_context_size_high != null && { high: q.search_context_size_high }),
      },
    };
  }

  // --- Capabilities (only truthy values) ---
  const capabilities: Record<string, boolean> = {};
  if (entry.supports_vision || entry.supports_image_input) capabilities.vision = true;
  if (entry.supports_function_calling) capabilities.functionCalling = true;
  if (entry.supports_parallel_function_calling) capabilities.parallelFunctionCalling = true;
  if (entry.supports_response_schema) capabilities.responseSchema = true;
  if (entry.supports_reasoning) capabilities.reasoning = true;
  if (entry.supports_prompt_caching) capabilities.promptCaching = true;
  if (entry.supports_system_messages) capabilities.systemMessages = true;
  if (entry.supports_tool_choice) capabilities.toolChoice = true;
  if (entry.supports_pdf_input) capabilities.pdfInput = true;
  if (entry.supports_audio_input) capabilities.audioInput = true;
  if (entry.supports_audio_output) capabilities.audioOutput = true;
  if (entry.supports_video_input) capabilities.videoInput = true;
  if (entry.supports_web_search) capabilities.webSearch = true;
  if (entry.supports_computer_use) capabilities.computerUse = true;
  if (entry.supports_assistant_prefill) capabilities.assistantPrefill = true;
  if (entry.supports_native_streaming) capabilities.nativeStreaming = true;
  if (entry.supports_service_tier) capabilities.serviceTier = true;
  if (entry.supports_embedding_image_input) capabilities.embeddingImageInput = true;

  // --- Build model ---
  const model: OutputModel = {
    id,
    provider,
    mode,
    tokenPricing,
    capabilities,
  };

  // Context limits
  if (entry.max_input_tokens) model.maxInputTokens = entry.max_input_tokens;
  if (entry.max_output_tokens) model.maxOutputTokens = entry.max_output_tokens;
  else if (entry.max_tokens && !entry.max_input_tokens) model.maxOutputTokens = entry.max_tokens;

  // Optional pricing
  if (imagePricing) model.imagePricing = imagePricing;
  if (mediaPricing) model.mediaPricing = mediaPricing;
  if (rerankPricing) model.rerankPricing = rerankPricing;
  if (searchPricing) model.searchPricing = searchPricing;

  // Embedding
  if (entry.output_vector_size) model.outputVectorSize = entry.output_vector_size;

  // Rerank limits
  if (entry.max_document_chunks_per_query)
    model.maxDocumentChunks = entry.max_document_chunks_per_query;
  if (entry.max_tokens_per_document_chunk)
    model.maxTokensPerChunk = entry.max_tokens_per_document_chunk;
  if (entry.max_query_tokens) model.maxQueryTokens = entry.max_query_tokens;

  // Metadata
  if (entry.deprecation_date) model.deprecationDate = entry.deprecation_date;
  if (entry.source) model.source = entry.source;
  if (entry.tool_use_system_prompt_tokens)
    model.toolUseSystemPromptTokens = entry.tool_use_system_prompt_tokens;

  return model;
}

function main() {
  console.log('Reading LiteLLM source data...');
  const raw = JSON.parse(readFileSync(SOURCE, 'utf-8'));

  const models: OutputModel[] = [];
  const stats = {
    total: 0,
    skipped: 0,
    byMode: {} as Record<string, number>,
    byProvider: new Set<string>(),
  };

  for (const [key, value] of Object.entries(raw)) {
    if (key === 'sample_spec') continue;
    stats.total++;

    const entry = value as LiteLLMEntry;
    const model = transformEntry(key, entry);

    if (!model) {
      stats.skipped++;
      continue;
    }

    models.push(model);
    stats.byMode[model.mode] = (stats.byMode[model.mode] ?? 0) + 1;
    stats.byProvider.add(model.provider);
  }

  // Sort by provider, then by id
  models.sort((a, b) => a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id));

  // Write output
  const output = {
    _meta: {
      generatedAt: new Date().toISOString(),
      source: 'litellm/model_prices_and_context_window.json',
      totalModels: models.length,
      totalProviders: stats.byProvider.size,
      byMode: stats.byMode,
    },
    models,
  };

  writeFileSync(OUTPUT, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`\n✅ Generated ${OUTPUT}`);
  console.log(`   Models: ${models.length} (skipped: ${stats.skipped})`);
  console.log(`   Providers: ${stats.byProvider.size}`);
  console.log(`   By mode:`);
  for (const [mode, count] of Object.entries(stats.byMode).toSorted((a, b) => b[1] - a[1])) {
    console.log(`     ${mode}: ${count}`);
  }
}

main();
