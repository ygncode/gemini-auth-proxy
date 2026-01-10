import { PROXY_PORT } from "./constants";
import { handleUIRequest } from "./routes/ui";
import { handleProxyRequest } from "./routes/proxy";

export function startServer(): void {
  const server = Bun.serve({
    port: PROXY_PORT,
    hostname: "0.0.0.0",
    fetch: async (request) => {
      const url = new URL(request.url);

      // Log all requests
      console.log(`[Server] ${request.method} ${url.pathname}`);

      // Handle UI routes
      const uiResponse = await handleUIRequest(request);
      if (uiResponse) {
        return uiResponse;
      }

      // Handle proxy routes
      const proxyResponse = await handleProxyRequest(request);
      if (proxyResponse) {
        return proxyResponse;
      }

      // Root redirect to UI
      if (url.pathname === "/" || url.pathname === "") {
        return new Response(null, {
          status: 302,
          headers: { Location: "/ui" },
        });
      }

      // 404 for unknown routes
      return new Response(
        JSON.stringify({
          error: {
            code: 404,
            message: `Unknown path: ${url.pathname}. Use /codeassist/* for Code Assist API or /gemini/* for standard Gemini API.`,
            status: "NOT_FOUND",
          },
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    },
  });

  console.log(`
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   gemini-auth-proxy is running                          │
│                                                         │
│   Server:     http://localhost:${PROXY_PORT}                   │
│   UI:         http://localhost:${PROXY_PORT}/ui                │
│                                                         │
│   Proxy endpoints:                                      │
│   • /codeassist/*  - Code Assist API (with transform)   │
│   • /gemini/*      - Standard Gemini API (OAuth only)   │
│                                                         │
│   Press Ctrl+C to stop                                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
`);
}
