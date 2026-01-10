import {
  parseGeminiApiBody,
  type GeminiApiBody,
} from "./helpers";
import { transformToOpenAI, transformStreamingToOpenAI } from "./openai";

/**
 * Transform Code Assist response to OpenAI-compatible format.
 */
export async function transformToOpenAIResponse(
  response: Response,
  streaming: boolean,
  requestedModel?: string
): Promise<Response> {
  const contentType = response.headers.get("content-type") ?? "";
  const isJsonResponse = contentType.includes("application/json");
  const isEventStreamResponse = contentType.includes("text/event-stream");

  if (!isJsonResponse && !isEventStreamResponse) {
    return response;
  }

  const model = requestedModel || "gemini-2.5-flash";

  try {
    const headers = new Headers();
    headers.set("content-type", isEventStreamResponse ? "text/event-stream" : "application/json");
    // Copy some headers
    const cacheControl = response.headers.get("cache-control");
    if (cacheControl) headers.set("cache-control", cacheControl);

    if (streaming && response.ok && isEventStreamResponse && response.body) {
      return new Response(transformStreamingToOpenAI(response.body, model), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    const text = await response.text();

    // Handle errors
    if (!response.ok) {
      try {
        const errorBody = JSON.parse(text);
        const openaiError = {
          error: {
            message: errorBody?.error?.message || "Unknown error",
            type: "api_error",
            code: errorBody?.error?.code || response.status,
          },
        };
        return new Response(JSON.stringify(openaiError), {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      } catch {
        return new Response(
          JSON.stringify({
            error: {
              message: text || "Unknown error",
              type: "api_error",
              code: response.status,
            },
          }),
          {
            status: response.status,
            statusText: response.statusText,
            headers,
          }
        );
      }
    }

    const parsed = parseGeminiApiBody(text);
    if (!parsed) {
      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    // Unwrap Code Assist response
    const geminiResponse = (parsed.response as any) || parsed;

    // Transform to OpenAI format
    const openaiResponse = transformToOpenAI(geminiResponse, model);

    return new Response(JSON.stringify(openaiResponse), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    console.error("Failed to transform to OpenAI format:", error);
    return response;
  }
}
