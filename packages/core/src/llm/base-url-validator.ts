// SPDX-License-Identifier: Apache-2.0
/**
 * Validate baseUrl for LLM providers to prevent SSRF + credential
 * exfiltration (Wave 12.D-fix per EVID-051 S-3 / CWE-918).
 *
 * Policy:
 * - https:// required unless host is localhost / 127.0.0.1 / ::1
 * - non-default hosts (anything not the provider's well-known default)
 *   emit a console.warn so operators see the override
 */
export function validateBaseUrl(
  baseUrl: string | undefined,
  defaultBaseUrl: string,
  providerName: string,
): string {
  if (!baseUrl) return defaultBaseUrl;
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`[${providerName}] invalid baseUrl: ${baseUrl}`);
  }
  const isLoopback =
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '[::1]' ||
    parsed.hostname === '::1';
  if (parsed.protocol !== 'https:' && !isLoopback) {
    throw new Error(
      `[${providerName}] baseUrl must use https:// (got ${parsed.protocol}). ` +
        `Loopback (localhost/127.0.0.1/::1) may use http:// for local dev.`,
    );
  }
  if (baseUrl !== defaultBaseUrl) {
    console.warn(
      `[${providerName}] baseUrl override: ${baseUrl} (default: ${defaultBaseUrl}). ` +
        `Ensure the URL is trusted — credentials are sent to this host.`,
    );
  }
  return baseUrl;
}
