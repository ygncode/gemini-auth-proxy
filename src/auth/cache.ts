import { getAuth, type AuthRecord } from "../db/sqlite";

const ACCESS_TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;

interface CachedAuth {
  access_token: string;
  expires_at: number;
}

let cachedAuth: CachedAuth | null = null;

/**
 * Determines whether an access token is expired or missing, with buffer for clock skew.
 */
function accessTokenExpired(auth: CachedAuth | null): boolean {
  if (!auth?.access_token || typeof auth.expires_at !== "number") {
    return true;
  }
  return auth.expires_at <= Date.now() + ACCESS_TOKEN_EXPIRY_BUFFER_MS;
}

/**
 * Returns a cached auth snapshot when available, favoring unexpired tokens.
 */
export function resolveCachedAuth(): CachedAuth | null {
  const dbAuth = getAuth();
  if (!dbAuth?.access_token) {
    return null;
  }

  const dbCachedAuth: CachedAuth = {
    access_token: dbAuth.access_token,
    expires_at: dbAuth.expires_at ?? 0,
  };

  // If db auth is not expired, update cache and return it
  if (!accessTokenExpired(dbCachedAuth)) {
    cachedAuth = dbCachedAuth;
    return dbCachedAuth;
  }

  // If cache is not expired, return it
  if (cachedAuth && !accessTokenExpired(cachedAuth)) {
    return cachedAuth;
  }

  // Both expired, return db auth
  cachedAuth = dbCachedAuth;
  return dbCachedAuth;
}

/**
 * Stores the latest auth snapshot.
 */
export function storeCachedAuth(auth: CachedAuth): void {
  cachedAuth = auth;
}

/**
 * Clears cached auth.
 */
export function clearCachedAuth(): void {
  cachedAuth = null;
}
