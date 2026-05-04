import type { DiagnosticEntry, DiagnosticSeverity } from './types';

const BOX_WIDTH = 70;
const INNER = BOX_WIDTH - 2; // space inside borders

const SEVERITY_ICON: Record<DiagnosticSeverity, string> = {
  critical: '\u274C', // red cross
  degraded: '\u26A0\uFE0F', // warning
  optional: '\u2139\uFE0F', // info
};

function line(content: string): string {
  // Pad/truncate to fit inside borders
  const trimmed = content.length > INNER ? content.slice(0, INNER - 1) + '\u2026' : content;
  return `\u2502  ${trimmed.padEnd(INNER - 2)}  \u2502`;
}

function separator(): string {
  return `\u251C${'─'.repeat(BOX_WIDTH)}\u2524`;
}

function top(): string {
  return `\u250C${'─'.repeat(BOX_WIDTH)}\u2510`;
}

function bottom(): string {
  return `\u2514${'─'.repeat(BOX_WIDTH)}\u2518`;
}

function emptyLine(): string {
  return line('');
}

/**
 * Render an ASCII-box diagnostic message for terminal output.
 *
 * Example:
 * ```
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  ❌ STARTUP FAILED: v1.files                                        │
 * ├──────────────────────────────────────────────────────────────────────┤
 * │  Component:  HashiCorp Vault (HSM)                                  │
 * │  Severity:   critical                                               │
 * │  Error:      Vault health check failed                              │
 * │                                                                      │
 * │  Quick Fix:                                                          │
 * │    $ cd infra/vault && docker compose up -d                         │
 * │                                                                      │
 * │  Hint: Or set HSM_ENABLED=false in .env                             │
 * │                                                                      │
 * │  📖 Guide: docs/guides/VAULT-HSM-OPERATIONS-GUIDE.md               │
 * └──────────────────────────────────────────────────────────────────────┘
 * ```
 */
export function renderDiagnosticBox(
  serviceName: string,
  errorMessage: string,
  entry: DiagnosticEntry,
): string {
  const icon = SEVERITY_ICON[entry.severity];
  const lines: string[] = [];

  lines.push(top());
  lines.push(line(`${icon} STARTUP FAILED: ${serviceName}`));
  lines.push(separator());
  lines.push(line(`Component:  ${entry.component}`));
  lines.push(line(`Severity:   ${entry.severity}`));

  // Truncate error to fit in box
  const maxErr = INNER - 14; // "Error:      " prefix
  const errText =
    errorMessage.length > maxErr ? errorMessage.slice(0, maxErr - 1) + '\u2026' : errorMessage;
  lines.push(line(`Error:      ${errText}`));
  lines.push(emptyLine());

  lines.push(line('Quick Fix:'));
  for (const cmd of entry.fix) {
    lines.push(line(`  $ ${cmd}`));
  }
  lines.push(emptyLine());

  if (entry.envHint) {
    lines.push(line(`Hint: ${entry.envHint}`));
    lines.push(emptyLine());
  }

  if (entry.guide) {
    lines.push(line(`\uD83D\uDCD6 Guide: ${entry.guide}`));
  }

  lines.push(bottom());

  return '\n' + lines.join('\n') + '\n';
}
