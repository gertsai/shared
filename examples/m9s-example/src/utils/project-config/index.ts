// SPDX-License-Identifier: Apache-2.0
/**
 * Load configuration with environment variable overrides.
 *
 * Mirrors `apps/pipeline/src/utils/project-config/index.ts` from the upstream
 * gertsai_codex monorepo so m9s-example shares the same idiomatic config
 * pattern. Combined with `import 'dotenv/config'` in `project.config.ts`,
 * env vars from `.env` (or the shell) override the literal defaults below.
 *
 * Type coercion:
 *   - boolean: 'true' or '1' → true, anything else → false
 *   - number: parsed with Number()
 *   - string: used as-is
 *
 * Keys present in process.env override the supplied default; keys absent
 * from process.env retain the literal default (preserving its inferred
 * type at the call site).
 */
export const loadConfig = <T extends Record<string, string | number | boolean | null>>(
  config: T,
): T => {
  Object.entries(config).forEach(([key, defaultValue]) => {
    if (!(key in process.env)) {
      return;
    }
    const envVal = process.env[key];
    if (typeof defaultValue === 'boolean') {
      // RFC-055 — boolean coercion: 'true'/'1' = true, everything else = false.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — narrow `T[key]` write via dynamic key
      config[key] = envVal === 'true' || envVal === '1';
    } else if (typeof defaultValue === 'number') {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — narrow `T[key]` write via dynamic key
      config[key] = +envVal!;
    } else {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — narrow `T[key]` write via dynamic key
      config[key] = envVal;
    }
  });

  return config;
};
