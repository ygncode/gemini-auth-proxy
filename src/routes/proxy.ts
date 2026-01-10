import { GEMINI_STANDARD_ENDPOINT } from "../constants";
import { ensureValidToken } from "../auth/token";
import { ensureProjectContext } from "../project/managed";
import {
  prepareCodeAssistRequest,
  prepareStandardGeminiRequest,
} from "../transform/request";
import { transformCodeAssistResponse } from "../transform/response";

/**
 * Handle proxy requests to /codeassist/* and /gemini/*
 */
export async function handleProxyRequest(
  request: Request
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  // Check if this is a proxy request
  const isCodeAssist = path.startsWith("/codeassist/");
  const isStandardGemini = path.startsWith("/gemini/");

  if (!isCodeAssist && !isStandardGemini) {
    return null;
  }

  console.log(`[Proxy] ${request.method} ${path}`);

  // Get valid access token (refreshing if needed)
  const accessToken = await ensureValidToken();
  if (!accessToken) {
    return new Response(
      JSON.stringify({
        error: {
          code: 401,
          message:
            "Not authenticated. Please log in at http://localhost:8888/ui",
          status: "UNAUTHENTICATED",
        },
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Extract the actual API path (remove /codeassist or /gemini prefix)
  const apiPath = isCodeAssist
    ? path.replace(/^\/codeassist/, "")
    : path.replace(/^\/gemini/, "");

  // Build the target URL
  const targetUrl = isCodeAssist
    ? `${GEMINI_STANDARD_ENDPOINT}${apiPath}${url.search}`
    : `${GEMINI_STANDARD_ENDPOINT}${apiPath}${url.search}`;

  try {
    // Get request body if present
    let body: string | undefined;
    if (request.method !== "GET" && request.method !== "HEAD") {
      body = await request.text();
    }

    // Prepare headers from original request
    const originalHeaders: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      // Skip headers that shouldn't be forwarded
      const skip = ["host", "connection", "content-length", "accept-encoding"];
      if (!skip.includes(key.toLowerCase())) {
        originalHeaders[key] = value;
      }
    });

    if (isCodeAssist) {
      // Get project ID for Code Assist
      const projectId = await ensureProjectContext(accessToken);

      // Prepare Code Assist request (with transformation)
      const prepared = prepareCodeAssistRequest(
        targetUrl,
        {
          method: request.method,
          headers: originalHeaders,
          body,
        },
        accessToken,
        projectId
      );

      // Make the request
      const response = await fetch(prepared.url, prepared.init);

      // Transform the response
      return transformCodeAssistResponse(
        response,
        prepared.streaming,
        prepared.requestedModel
      );
    } else {
      // Standard Gemini also uses Code Assist API for OAuth support
      const projectId = await ensureProjectContext(accessToken);

      const prepared = prepareCodeAssistRequest(
        targetUrl,
        {
          method: request.method,
          headers: originalHeaders,
          body,
        },
        accessToken,
        projectId
      );

      const response = await fetch(prepared.url, prepared.init);

      return transformCodeAssistResponse(
        response,
        prepared.streaming,
        prepared.requestedModel
      );
    }
  } catch (error) {
    console.error("Proxy error:", error);
    return new Response(
      JSON.stringify({
        error: {
          code: 500,
          message: error instanceof Error ? error.message : "Internal proxy error",
          status: "INTERNAL",
        },
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
