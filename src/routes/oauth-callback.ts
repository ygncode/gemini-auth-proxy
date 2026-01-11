import { GEMINI_REDIRECT_URI, OAUTH_CALLBACK_PORT } from "../constants";
import { exchangeGemini, type GeminiTokenExchangeResult } from "../auth/oauth";
import { saveAuth } from "../db/sqlite";

interface OAuthCallbackResult {
  type: "success" | "failed";
  email?: string;
  error?: string;
}

let pendingCallback: {
  resolve: (result: OAuthCallbackResult) => void;
  verifier: string;
  timeout: Timer;
} | null = null;

let callbackServer: ReturnType<typeof Bun.serve> | null = null;

const redirectUri = new URL(GEMINI_REDIRECT_URI);
const callbackPath = redirectUri.pathname || "/";

const successHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Gemini Auth Proxy - Success</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      background: #0d1117;
      color: #e6edf3;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }
    main {
      text-align: center;
      padding: 2rem;
    }
    h1 {
      color: #3fb950;
      font-size: 1.5rem;
      margin-bottom: 1rem;
    }
    p {
      color: #8b949e;
      margin-bottom: 1.5rem;
    }
    .btn {
      background: #3fb950;
      color: #0d1117;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 6px;
      font-family: inherit;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
    }
    .btn:hover {
      background: #46c75a;
    }
  </style>
</head>
<body>
  <main>
    <h1>Authentication successful!</h1>
    <p>You can close this window and return to the proxy UI.</p>
    <button class="btn" onclick="window.close()">Close window</button>
  </main>
</body>
</html>`;

const errorHtml = (error: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Gemini Auth Proxy - Error</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      background: #0d1117;
      color: #e6edf3;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }
    main {
      text-align: center;
      padding: 2rem;
    }
    h1 {
      color: #f85149;
      font-size: 1.5rem;
      margin-bottom: 1rem;
    }
    p {
      color: #8b949e;
      margin-bottom: 1.5rem;
    }
    .error {
      background: rgba(248, 81, 73, 0.15);
      border: 1px solid rgba(248, 81, 73, 0.4);
      padding: 1rem;
      border-radius: 6px;
      color: #f85149;
      font-size: 0.875rem;
      max-width: 400px;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <main>
    <h1>Authentication failed</h1>
    <p>Please close this window and try again.</p>
    <div class="error">${error}</div>
  </main>
</body>
</html>`;

/**
 * Start the OAuth callback server on port 8085.
 */
export async function startOAuthCallbackServer(
  verifier: string,
  timeoutMs = 5 * 60 * 1000
): Promise<OAuthCallbackResult> {
  // Clean up any existing server/callback
  if (callbackServer) {
    callbackServer.stop();
    callbackServer = null;
  }
  if (pendingCallback) {
    clearTimeout(pendingCallback.timeout);
    pendingCallback.resolve({ type: "failed", error: "Superseded by new login attempt" });
    pendingCallback = null;
  }

  return new Promise<OAuthCallbackResult>((resolve) => {
    const timeout = setTimeout(() => {
      if (pendingCallback) {
        pendingCallback = null;
      }
      if (callbackServer) {
        callbackServer.stop();
        callbackServer = null;
      }
      resolve({ type: "failed", error: "OAuth callback timed out" });
    }, timeoutMs);

    pendingCallback = { resolve, verifier, timeout };

    callbackServer = Bun.serve({
      port: OAUTH_CALLBACK_PORT,
      hostname: "0.0.0.0",
      fetch: async (request) => {
        const url = new URL(request.url);

        if (url.pathname !== callbackPath) {
          return new Response("Not found", { status: 404 });
        }

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) {
          const errorDesc = url.searchParams.get("error_description") ?? error;
          if (pendingCallback) {
            clearTimeout(pendingCallback.timeout);
            pendingCallback.resolve({ type: "failed", error: errorDesc });
            pendingCallback = null;
          }
          if (callbackServer) {
            setTimeout(() => {
              callbackServer?.stop();
              callbackServer = null;
            }, 100);
          }
          return new Response(errorHtml(errorDesc), {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }

        if (!code || !state) {
          const errorMsg = "Missing code or state in callback";
          if (pendingCallback) {
            clearTimeout(pendingCallback.timeout);
            pendingCallback.resolve({ type: "failed", error: errorMsg });
            pendingCallback = null;
          }
          return new Response(errorHtml(errorMsg), {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }

        // Exchange the code for tokens
        const result = await exchangeGemini(code, state);

        if (result.type === "failed") {
          if (pendingCallback) {
            clearTimeout(pendingCallback.timeout);
            pendingCallback.resolve({ type: "failed", error: result.error });
            pendingCallback = null;
          }
          if (callbackServer) {
            setTimeout(() => {
              callbackServer?.stop();
              callbackServer = null;
            }, 100);
          }
          return new Response(errorHtml(result.error), {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }

        // Save tokens to database
        saveAuth({
          refresh_token: result.refresh_token,
          access_token: result.access_token,
          expires_at: result.expires_at,
          email: result.email,
        });

        if (pendingCallback) {
          clearTimeout(pendingCallback.timeout);
          pendingCallback.resolve({ type: "success", email: result.email });
          pendingCallback = null;
        }

        // Stop the server after a short delay
        if (callbackServer) {
          setTimeout(() => {
            callbackServer?.stop();
            callbackServer = null;
          }, 100);
        }

        return new Response(successHtml, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      },
    });
  });
}

/**
 * Check if OAuth is in progress.
 */
export function isOAuthInProgress(): boolean {
  return pendingCallback !== null;
}

/**
 * Check the OAuth callback result (non-blocking).
 */
export function checkOAuthResult(): OAuthCallbackResult | null {
  // If no pending callback, OAuth is not in progress
  if (!pendingCallback) {
    // Check if we have auth in DB (from a successful callback)
    const auth = require("../db/sqlite").getAuth();
    if (auth?.refresh_token) {
      return { type: "success", email: auth.email ?? undefined };
    }
    return null;
  }
  return null; // Still in progress
}
