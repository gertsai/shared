/**
 * Token data returned from auth verification
 */
export interface TokenData {
  uid: string;
  type?: string;
  status?: string;
  email?: string;
  name?: string;
  [key: string]: unknown;
}

/**
 * Auth provider interface - abstraction over token verification
 *
 * Implementations:
 * - FirebaseAuthProvider (uses firebase-admin)
 * - JWTAuthProvider (uses jsonwebtoken)
 * - PostgresAuthProvider (checks tokens in DB)
 * - MockAuthProvider (for testing)
 */
export interface AuthProvider {
  /**
   * Verify an ID token and return user data
   * @param token - The token to verify
   * @returns Token data with user info
   * @throws Error if token is invalid
   */
  verifyIdToken(token: string): Promise<TokenData>;
}

/**
 * Auth provider error codes
 */
export enum AuthErrorCode {
  TOKEN_EXPIRED = 'auth/id-token-expired',
  TOKEN_INVALID = 'auth/argument-error',
  TOKEN_REVOKED = 'auth/id-token-revoked',
  USER_NOT_FOUND = 'auth/user-not-found',
  USER_DISABLED = 'auth/user-disabled',
}

/**
 * Auth provider error
 */
export class AuthProviderError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message?: string,
  ) {
    super(message || code);
    this.name = 'AuthProviderError';
  }

  get errorInfo() {
    return { code: this.code };
  }
}

/**
 * No-op auth provider for development/testing
 * Parses JWT without verification (UNSAFE - dev only!)
 */
export class NoOpAuthProvider implements AuthProvider {
  async verifyIdToken(token: string): Promise<TokenData> {
    try {
      // Parse JWT payload without verification
      const parts = token.split('.');
      if (parts.length !== 3 || parts[1] === undefined) {
        throw new AuthProviderError(AuthErrorCode.TOKEN_INVALID, 'Invalid JWT format');
      }

      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

      return {
        uid: payload.user_id || payload.sub || payload.uid,
        type: payload.type || 'user',
        status: 'active',
        email: payload.email,
        name: payload.name,
      };
    } catch (error) {
      if (error instanceof AuthProviderError) throw error;
      throw new AuthProviderError(AuthErrorCode.TOKEN_INVALID, 'Failed to parse token');
    }
  }
}

/**
 * Auth provider registry - allows registering custom providers
 */
let currentAuthProvider: AuthProvider = new NoOpAuthProvider();

export function setAuthProvider(provider: AuthProvider): void {
  currentAuthProvider = provider;
}

export function getAuthProvider(): AuthProvider {
  return currentAuthProvider;
}

/**
 * Convenience function to verify token using current provider
 */
export async function verifyIdToken(token: string): Promise<TokenData> {
  return currentAuthProvider.verifyIdToken(token);
}
