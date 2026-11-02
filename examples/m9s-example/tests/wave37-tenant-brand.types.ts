// SPDX-License-Identifier: Apache-2.0
import type { TenantId } from '@gertsai/tenant';

import type { Wave5ContextSnapshot } from '../src/composition/wave5-middlewares';
import type { OllamaEmbedder } from '../src/infrastructure/ollama-embedder';
import type { OpenAIEmbedder } from '../src/infrastructure/openai-embedder';
import type { PgDocumentRepositoryOptions } from '../src/infrastructure/pg-document.repository';
import type { PgVectorStoreOptions } from '../src/infrastructure/pg-vector.store';

type Assert<T extends true> = T;
type RejectsPlain<T> = string extends T ? false : true;

type TenantIdRejectsPlainString = Assert<RejectsPlain<TenantId>>;
type DocumentOptionsRejectPlainString = Assert<
  RejectsPlain<PgDocumentRepositoryOptions['tenantId']>
>;
type VectorOptionsRejectPlainString = Assert<
  RejectsPlain<PgVectorStoreOptions['tenantId']>
>;
type OpenAIOptionsRejectPlainString = Assert<
  RejectsPlain<ConstructorParameters<typeof OpenAIEmbedder>[0]['tenantId']>
>;
type OllamaOptionsRejectPlainString = Assert<
  RejectsPlain<ConstructorParameters<typeof OllamaEmbedder>[0]['tenantId']>
>;
type ContextSnapshotRejectsPlainString = Assert<
  RejectsPlain<Exclude<Wave5ContextSnapshot['expectedTenantId'], undefined>>
>;

type TenantIdAcceptedByDocumentOptions = Assert<
  TenantId extends PgDocumentRepositoryOptions['tenantId'] ? true : false
>;
type TenantIdAcceptedByVectorOptions = Assert<
  TenantId extends PgVectorStoreOptions['tenantId'] ? true : false
>;
type TenantIdAcceptedByOpenAIOptions = Assert<
  TenantId extends ConstructorParameters<typeof OpenAIEmbedder>[0]['tenantId']
    ? true
    : false
>;
type TenantIdAcceptedByOllamaOptions = Assert<
  TenantId extends ConstructorParameters<typeof OllamaEmbedder>[0]['tenantId']
    ? true
    : false
>;
type TenantIdAcceptedByContextSnapshot = Assert<
  TenantId extends Exclude<Wave5ContextSnapshot['expectedTenantId'], undefined>
    ? true
    : false
>;

export type TenantBrandCompileAssertions = [
  TenantIdRejectsPlainString,
  DocumentOptionsRejectPlainString,
  VectorOptionsRejectPlainString,
  OpenAIOptionsRejectPlainString,
  OllamaOptionsRejectPlainString,
  ContextSnapshotRejectsPlainString,
  TenantIdAcceptedByDocumentOptions,
  TenantIdAcceptedByVectorOptions,
  TenantIdAcceptedByOpenAIOptions,
  TenantIdAcceptedByOllamaOptions,
  TenantIdAcceptedByContextSnapshot,
];
