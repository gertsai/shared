export type { DiagnosticSeverity, DiagnosticEntry, DiagnosticResult } from './types';
export { DiagnosticRegistry } from './registry';
export { renderDiagnosticBox } from './renderer';

// Side-effect: register built-in diagnostics
import './builtins';
