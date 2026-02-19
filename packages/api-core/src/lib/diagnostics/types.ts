/**
 * Startup Diagnostics — types for error pattern matching and fix suggestions.
 *
 * Used by DiagnosticRegistry to match infrastructure errors at service startup
 * and render actionable ASCII-box messages with fix commands.
 */

/** How severely the missing component affects the service */
export type DiagnosticSeverity = 'critical' | 'degraded' | 'optional';

/**
 * A single diagnostic entry — maps error patterns to a component + fix.
 *
 * `match` can be:
 * - RegExp: tested against `error.message + error.stack`
 * - string[]: any substring match triggers the diagnostic
 *
 * `services` can be:
 * - `'*'`: matches any service
 * - `string[]`: only matches listed service names (without version prefix)
 */
export interface DiagnosticEntry {
  match: RegExp | string[];
  services: string[] | '*';
  component: string;
  severity: DiagnosticSeverity;
  fix: string[];
  envHint?: string;
  guide?: string;
}

/** Result returned by `DiagnosticRegistry.diagnose()` — discriminated union on `matched` */
export type DiagnosticResult =
  | {
      matched: true;
      entry: DiagnosticEntry;
      formattedBox: string;
      errorMessage: string;
      serviceName: string;
    }
  | { matched: false; errorMessage: string; serviceName: string };
