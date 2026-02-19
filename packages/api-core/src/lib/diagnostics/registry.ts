import type { DiagnosticEntry, DiagnosticResult } from './types';
import { renderDiagnosticBox } from './renderer';

/**
 * Static singleton registry for startup diagnostic patterns.
 *
 * Services register error patterns with fix suggestions.
 * When a started handler fails, `diagnose()` matches the error
 * and returns a formatted ASCII-box with actionable guidance.
 *
 * Pattern: same as ConnectorRegistry — global singleton, no instantiation.
 */
export class DiagnosticRegistry {
  private static entries: DiagnosticEntry[] = [];

  private constructor() {
    // Static-only — prevent instantiation
  }

  /** Register one or more diagnostic entries */
  static register(...entries: DiagnosticEntry[]): void {
    DiagnosticRegistry.entries.push(...entries);
  }

  /** Clear all entries (for testing) */
  static clear(): void {
    DiagnosticRegistry.entries = [];
  }

  /** Get count of registered entries (for testing/debugging) */
  static get size(): number {
    return DiagnosticRegistry.entries.length;
  }

  /**
   * Diagnose a startup error — find matching pattern and render fix box.
   *
   * @param serviceName - Full service name (e.g. "v1.files")
   * @param error - The caught error
   * @returns DiagnosticResult with `matched: true` and `formattedBox` if a pattern matches
   */
  static diagnose(serviceName: string, error: unknown): DiagnosticResult {
    const fullText = extractErrorText(error);
    const displayMessage = extractDisplayMessage(error);
    const shortName = extractShortServiceName(serviceName);

    for (const entry of DiagnosticRegistry.entries) {
      if (!matchesService(entry, shortName)) continue;
      if (!matchesError(entry, fullText)) continue;

      return {
        matched: true,
        entry,
        formattedBox: renderDiagnosticBox(serviceName, displayMessage, entry),
        errorMessage: displayMessage,
        serviceName,
      };
    }

    return { matched: false, errorMessage: displayMessage, serviceName };
  }
}

/** Extract full text to match against (message + stack for broad regex matching) */
function extractErrorText(error: unknown): string {
  if (error instanceof Error) {
    return [error.message, error.stack ?? ''].join('\n');
  }
  return String(error);
}

/** Extract single-line message for display in the ASCII box */
function extractDisplayMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Strip version prefix: "v1.files" -> "files" */
function extractShortServiceName(serviceName: string): string {
  const dot = serviceName.indexOf('.');
  return dot >= 0 ? serviceName.slice(dot + 1) : serviceName;
}

/** Check if entry applies to this service */
function matchesService(entry: DiagnosticEntry, shortName: string): boolean {
  if (entry.services === '*') return true;
  return entry.services.some(
    (s) => s === shortName || shortName.startsWith(s + '.') || shortName.endsWith('.' + s),
  );
}

/** Check if error text matches the entry pattern */
function matchesError(entry: DiagnosticEntry, errorText: string): boolean {
  if (entry.match instanceof RegExp) {
    return entry.match.test(errorText);
  }
  // string[] — any substring match
  const lower = errorText.toLowerCase();
  return entry.match.some((pattern) => lower.includes(pattern.toLowerCase()));
}
