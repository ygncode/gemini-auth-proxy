import { GEMINI_CLIENT_ID, GEMINI_CLIENT_SECRET } from "../constants";
import {
  getAuth,
  updateAccessToken,
  clearAuth,
  type AuthRecord,
} from "../db/sqlite";
import { storeCachedAuth, clearCachedAuth } from "./cache";
import { invalidateProjectContextCache } from "../project/managed";

const ACCESS_TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;

export interface TokenState {
  hasToken: boolean;
  accessToken: string | null;
  expiresAt: number | null;
  email: string | null;
  isExpired: boolean;
  needsRefresh: boolean;
}

interface OAuthErrorPayload {
  error?:
    | string
    | {
        code?: string;
        status?: string;
        message?: string;
      };
  error_description?: string;
}

/**
 * Parses OAuth error payloads returned by Google token endpoints.
 */
function parseOAuthErrorPayload(
  text: string | undefined
): { code?: string; description?: string } {
  if (!text) {
    return {};
  }

  try {
    const payload = JSON.parse(text) as OAuthErrorPayload;
    if (!payload || typeof payload !== "object") {
      return { description: text };
    }

    let code: string | undefined;
    if (typeof payload.error === "string") {
      code = payload.error;
    } else if (payload.error && typeof payload.error === "object") {
      code = payload.error.status ?? payload.error.code;
      if (!payload.error_description && payload.error.message) {
        return { code, description: payload.error.message };
      }
    }

    const description = payload.error_description;
    if (description) {
      return { code, description };
    }

    if (
      payload.error &&
      typeof payload.error === "object" &&
      payload.error.message
    ) {
      return { code, description: payload.error.message };
    }

    return { code };
  } catch {
    return { description: text };
  }
}

/**
 * Determines whether an access token is expired or missing, with buffer for clock skew.
 */
export function accessTokenExpired(auth: AuthRecord | null): boolean {
  if (!auth?.access_token || typeof auth.expires_at !== "number") {
    return true;
  }
  return auth.expires_at <= Date.now() + ACCESS_TOKEN_EXPIRY_BUFFER_MS;
}

/**
 * Get current token state from database.
 */
export function getTokenState(): TokenState {
  const auth = getAuth();
  const hasToken = !!auth?.refresh_token;
  const isExpired = accessTokenExpired(auth);

  return {
    hasToken,
    accessToken: auth?.access_token ?? null,
    expiresAt: auth?.expires_at ?? null,
    email: auth?.email ?? null,
    isExpired,
    needsRefresh: hasToken && isExpired,
  };
}

/**
 * Refreshes a Gemini OAuth access token, updates persisted credentials, and handles revocation.
 * Returns the new access token on success, or null on failure.
 */
export async function refreshAccessToken(): Promise<string | null> {
  const auth = getAuth();
  if (!auth?.refresh_token) {
    return null;
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: auth.refresh_token,
        client_id: GEMINI_CLIENT_ID,
        client_secret: GEMINI_CLIENT_SECRET,
      }),
    });

    if (!response.ok) {
      let errorText: string | undefined;
      try {
        errorText = await response.text();
      } catch {
        errorText = undefined;
      }

      const { code, description } = parseOAuthErrorPayload(errorText);
      const details = [code, description ?? errorText]
        .filter(Boolean)
        .join(": ");
      const baseMessage = `Gemini token refresh failed (${response.status} ${response.statusText})`;
      console.warn(
        `[Gemini OAuth] ${details ? `${baseMessage} - ${details}` : baseMessage}`
      );

      if (code === "invalid_grant") {
        console.warn(
          "[Gemini OAuth] Google revoked the stored refresh token. Please log in again."
        );
        invalidateProjectContextCache();
        clearCachedAuth();
        clearAuth();
      }

      return null;
    }

    const payload = (await response.json()) as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
    };

    const newExpiresAt = Date.now() + payload.expires_in * 1000;

    // Update database with new access token (and optionally new refresh token)
    updateAccessToken(
      payload.access_token,
      newExpiresAt,
      payload.refresh_token
    );

    // Update cache
    storeCachedAuth({
      access_token: payload.access_token,
      expires_at: newExpiresAt,
    });

    invalidateProjectContextCache();

    return payload.access_token;
  } catch (error) {
    console.error(
      "Failed to refresh Gemini access token due to an unexpected error:",
      error
    );
    return null;
  }
}

/**
 * Ensures we have a valid access token, refreshing if necessary.
 * Returns the access token or null if not authenticated.
 */
export async function ensureValidToken(): Promise<string | null> {
  const auth = getAuth();
  if (!auth?.refresh_token) {
    return null;
  }

  if (!accessTokenExpired(auth)) {
    return auth.access_token;
  }

  return refreshAccessToken();
}
