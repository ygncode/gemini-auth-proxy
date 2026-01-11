import { layout } from "../ui/templates/layout";
import {
  homePage,
  loginInProgress,
  loginSuccess,
  loginError,
  logoutSuccess,
} from "../ui/templates/login";
import { statusSection } from "../ui/templates/status";
import { authorizeGemini } from "../auth/oauth";
import { getTokenState } from "../auth/token";
import { clearAuth, getAuth } from "../db/sqlite";
import { clearCachedAuth } from "../auth/cache";
import { invalidateProjectContextCache } from "../project/managed";
import {
  startOAuthCallbackServer,
  isOAuthInProgress,
} from "./oauth-callback";

// Store pending OAuth state
let pendingOAuth: {
  verifier: string;
  promise: Promise<{ type: "success" | "failed"; email?: string; error?: string }>;
} | null = null;

export async function handleUIRequest(
  request: Request
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  // Main UI page
  if (path === "/ui" || path === "/ui/") {
    return new Response(layout(homePage()), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Status partial (for HTMX refresh)
  if (path === "/ui/status") {
    return new Response(statusSection(), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Login action
  if (path === "/ui/login" && request.method === "POST") {
    try {
      // Start OAuth flow
      const authorization = await authorizeGemini();

      // Start callback server
      const callbackPromise = startOAuthCallbackServer(authorization.verifier);
      pendingOAuth = { verifier: authorization.verifier, promise: callbackPromise };

      // Try to open browser, but don't fail if it doesn't work (e.g., in Docker)
      let browserOpened = false;
      try {
        const openCommand =
          process.platform === "darwin"
            ? "open"
            : process.platform === "win32"
              ? "start"
              : "xdg-open";

        const proc = Bun.spawn([openCommand, authorization.url], {
          stdout: "ignore",
          stderr: "ignore",
        });
        await proc.exited;
        browserOpened = proc.exitCode === 0;
      } catch {
        browserOpened = false;
      }

      // If browser didn't open, show the URL for manual click
      return new Response(loginInProgress(browserOpened ? undefined : authorization.url), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } catch (error) {
      return new Response(
        loginError(error instanceof Error ? error.message : "Unknown error"),
        {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }
      );
    }
  }

  // Check login status (polled by HTMX during OAuth flow)
  if (path === "/ui/login/check") {
    // Check if OAuth is still in progress
    if (pendingOAuth) {
      // Check if the promise has resolved
      const result = await Promise.race([
        pendingOAuth.promise.then((r) => ({ done: true, result: r })),
        Promise.resolve({ done: false, result: null }),
      ]);

      if (result.done && result.result) {
        pendingOAuth = null;
        if (result.result.type === "success") {
          return new Response(loginSuccess(result.result.email), {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        } else {
          return new Response(loginError(result.result.error ?? "Unknown error"), {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
      }

      // Still waiting, return empty to keep polling
      return new Response("", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // No pending OAuth, check if we got logged in
    const auth = getAuth();
    if (auth?.refresh_token) {
      return new Response(loginSuccess(auth.email ?? undefined), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Not logged in and no pending OAuth
    return new Response(homePage(), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Logout action
  if (path === "/ui/logout" && request.method === "POST") {
    // Clear all auth data
    clearAuth();
    clearCachedAuth();
    invalidateProjectContextCache();

    return new Response(logoutSuccess(), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return null;
}
