import { z } from 'zod';
import { createId } from '../../ids';

export const DocumentMetadataSchema = z
  .object({
    file_path: z.string().optional(),
    file_name: z.string().optional(),
    file_type: z.string().optional(),
    file_size: z.number().optional(),

    Header_1: z.string().optional(),
    Header_2: z.string().optional(),
    Header_3: z.string().optional(),
    section_path: z.string().optional(),

    source_type: z.enum(['file', 'url', 'stream', 'memory']).optional(),
    url: z.string().url().optional(),

    created_at: z.string().datetime().optional(),
    modified_at: z.string().datetime().optional(),

    extra: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>;

export const DocumentSchema = z.object({
  id: z.string(),
  text: z.string(),
  metadata: DocumentMetadataSchema.default({}),
  embedding: z.array(z.number()).optional(),
});

export type Document = z.infer<typeof DocumentSchema>;

export function createDocument(text: string, metadata?: Partial<DocumentMetadata>): Document {
  return {
    id: createId('doc'),
    text,
    metadata: { ...metadata },
  };
}

