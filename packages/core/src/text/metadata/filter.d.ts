import { MetadataMode } from './modes';
export interface FilterMetadataOptions {
    excludedEmbedKeys?: readonly string[];
    excludedLLMKeys?: readonly string[];
}
export declare function filterMetadata(metadata: Record<string, unknown>, mode: MetadataMode, options?: FilterMetadataOptions): Record<string, unknown>;
//# sourceMappingURL=filter.d.ts.map