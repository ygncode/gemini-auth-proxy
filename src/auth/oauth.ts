import {
  GEMINI_CLIENT_ID,
  GEMINI_CLIENT_SECRET,
  GEMINI_REDIRECT_URI,
  GEMINI_SCOPES,
} from "../constants";

interface PkcePair {
  challenge: string;
  verifier: string;
}

/**
 * Result returned to the caller after constructing an OAuth authorization URL.
 */
export interface GeminiAuthorization {
  url: string;
  verifier: string;
}

interface GeminiTokenExchangeSuccess {
  type: "success";
  refresh_token: string;
  access_token: string;
  expires_at: number;
  email?: string;
}

interface GeminiTokenExchangeFailure {
  type: "failed";
  error: string;
}

export type GeminiTokenExchangeResult =
  | GeminiTokenExchangeSuccess
  | GeminiTokenExchangeFailure;

interface GeminiTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
}

interface GeminiUserInfo {
  email?: string;
}

/**
 * Generate PKCE code verifier and challenge.
 * Using Web Crypto API for S256 method.
 */
async function generatePKCE(): Promise<PkcePair> {
  // Generate random verifier (43-128 characters)
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = base64UrlEncode(array);

  // Create S256 challenge
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const challenge = base64UrlEncode(new Uint8Array(hashBuffer));

  return { verifier, challenge };
}

function base64UrlEncode(buffer: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Encode an object into a URL-safe base64 string.
 */
function encodeState(payload: { verifier: string }): string {
  const json = JSON.stringify(payload);
  const encoder = new TextEncoder();
  const data = encoder.encode(json);
  return base64UrlEncode(data);
}

/**
 * Decode an OAuth state parameter back into its structured representation.
 */
export function decodeState(state: string): { verifier: string } {
  const normalized = state.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "="
  );
  const json = atob(padded);
  const parsed = JSON.parse(json);
  if (typeof parsed.verifier !== "string") {
    throw new Error("Missing PKCE verifier in state");
  }
  return { verifier: parsed.verifier };
}

/**
 * Build the Gemini OAuth authorization URL including PKCE.
 */
export async function authorizeGemini(): Promise<GeminiAuthorization> {
  const pkce = await generatePKCE();

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", GEMINI_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", GEMINI_REDIRECT_URI);
  url.searchParams.set("scope", GEMINI_SCOPES.join(" "));
  url.searchParams.set("code_challenge", pkce.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", encodeState({ verifier: pkce.verifier }));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");

  return {
    url: url.toString(),
    verifier: pkce.verifier,
  };
}

/**
 * Exchange an authorization code for Gemini CLI access and refresh tokens.
 */
export async function exchangeGemini(
  code: string,
  state: string
): Promise<GeminiTokenExchangeResult> {
  try {
    const { verifier } = decodeState(state);
    return await exchangeGeminiWithVerifier(code, verifier);
  } catch (error) {
    return {
      type: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Exchange an authorization code using a known PKCE verifier.
 */
export async function exchangeGeminiWithVerifier(
  code: string,
  verifier: string
): Promise<GeminiTokenExchangeResult> {
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: GEMINI_CLIENT_ID,
        client_secret: GEMINI_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: GEMINI_REDIRECT_URI,
        code_verifier: verifier,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return { type: "failed", error: errorText };
    }

    const tokenPayload = (await tokenResponse.json()) as GeminiTokenResponse;

    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
      {
        headers: {
          Authorization: `Bearer ${tokenPayload.access_token}`,
        },
      }
    );

    const userInfo = userInfoResponse.ok
      ? ((await userInfoResponse.json()) as GeminiUserInfo)
      : {};

    const refreshToken = tokenPayload.refresh_token;
    if (!refreshToken) {
      return { type: "failed", error: "Missing refresh token in response" };
    }

    return {
      type: "success",
      refresh_token: refreshToken,
      access_token: tokenPayload.access_token,
      expires_at: Date.now() + tokenPayload.expires_in * 1000,
      email: userInfo.email,
    };
  } catch (error) {
    return {
      type: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
