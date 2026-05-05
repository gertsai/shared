export type { DiagnosticSeverity, DiagnosticEntry, DiagnosticResult } from './types';
export { DiagnosticRegistry } from './registry';
export { renderDiagnosticBox } from './renderer';
export { DIAGNOSTIC_BUILTINS } from './builtins';

import { DiagnosticRegistry } from './registry';
import { DIAGNOSTIC_BUILTINS } from './builtins';

/**
 * Opt-in registration of builtin diagnostics (PostgreSQL, Redis, Vault,
 * MinIO, Milvus, FalkorDB, OpenFGA, LiteLLM, etc.). Consumers must call
 * this explicitly in startup code if they want builtin patterns enabled.
 *
 * Not invoked on import per ADR-003 §I-1 — `contracts` subpath must stay
 * free of side effects so it can be imported in browser/edge contexts
 * without pulling in DB/cloud-specific behaviour.
 */
let builtinsRegistered = false;

export function registerBuiltinDiagnostics(): void {
  if (builtinsRegistered) return;
  builtinsRegistered = true;
  DiagnosticRegistry.register(...DIAGNOSTIC_BUILTINS);
}
