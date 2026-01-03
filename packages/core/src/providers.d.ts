/** @deprecated Use BaseLLM from @gerts/core/llm instead */
export interface LegacyLLMProvider {
    generate(prompt: string, options?: Record<string, unknown>): Promise<string>;
}
export interface EmbeddingsProvider {
    embed(texts: string[]): Promise<number[][]>;
}
export interface StorageProvider<T = unknown> {
    put(key: string, value: T): Promise<void>;
    get(key: string): Promise<T | null>;
    delete(key: string): Promise<void>;
}
//# sourceMappingURL=providers.d.ts.map