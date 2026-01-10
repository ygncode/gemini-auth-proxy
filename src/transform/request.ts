import {
  CODE_ASSIST_HEADERS,
  GEMINI_CODE_ASSIST_ENDPOINT,
} from "../constants";
import { normalizeThinkingConfig } from "./helpers";

const STREAM_ACTION = "streamGenerateContent";
const MODEL_FALLBACKS: Record<string, string> = {
  "gemini-2.5-flash-image": "gemini-2.5-flash",
};

export interface PreparedRequest {
  url: string;
  init: RequestInit;
  streaming: boolean;
  requestedModel?: string;
}

/**
 * Rewrites requests into Gemini Code Assist shape, normalizing model, headers,
 * optional cached_content, and thinking config. Also toggles streaming mode for SSE actions.
 */
export function prepareCodeAssistRequest(
  originalUrl: string,
  originalInit: RequestInit | undefined,
  accessToken: string,
  projectId: string
): PreparedRequest {
  const headers = new Headers(originalInit?.headers ?? {});

  // Set auth header
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.delete("x-goog-api-key");
  headers.delete("x-api-key");

  // Parse the URL to extract model and action
  const match = originalUrl.match(/\/models\/([^:]+):(\w+)/);
  if (!match) {
    // Not a model request, pass through with auth
    return {
      url: originalUrl,
      init: { ...originalInit, headers },
      streaming: false,
    };
  }

  const [, rawModel = "", rawAction = ""] = match;
  const effectiveModel = MODEL_FALLBACKS[rawModel] ?? rawModel;
  const streaming = rawAction === STREAM_ACTION;
  const transformedUrl = `${GEMINI_CODE_ASSIST_ENDPOINT}/v1internal:${rawAction}${
    streaming ? "?alt=sse" : ""
  }`;

  let body = originalInit?.body;
  if (typeof originalInit?.body === "string" && originalInit.body) {
    try {
      const parsedBody = JSON.parse(originalInit.body) as Record<
        string,
        unknown
      >;
      const isWrapped =
        typeof parsedBody.project === "string" && "request" in parsedBody;

      if (isWrapped) {
        // Already wrapped, just update model
        const wrappedBody = {
          ...parsedBody,
          model: effectiveModel,
        } as Record<string, unknown>;
        body = JSON.stringify(wrappedBody);
      } else {
        // Wrap the request
        const requestPayload: Record<string, unknown> = { ...parsedBody };

        // Normalize thinking config
        const rawGenerationConfig = requestPayload.generationConfig as
          | Record<string, unknown>
          | undefined;
        const normalizedThinking = normalizeThinkingConfig(
          rawGenerationConfig?.thinkingConfig
        );
        if (normalizedThinking) {
          if (rawGenerationConfig) {
            rawGenerationConfig.thinkingConfig = normalizedThinking;
            requestPayload.generationConfig = rawGenerationConfig;
          } else {
            requestPayload.generationConfig = {
              thinkingConfig: normalizedThinking,
            };
          }
        } else if (rawGenerationConfig?.thinkingConfig) {
          delete rawGenerationConfig.thinkingConfig;
          requestPayload.generationConfig = rawGenerationConfig;
        }

        // Normalize system_instruction to systemInstruction
        if ("system_instruction" in requestPayload) {
          requestPayload.systemInstruction = requestPayload.system_instruction;
          delete requestPayload.system_instruction;
        }

        // Handle cached content
        const cachedContentFromExtra =
          typeof requestPayload.extra_body === "object" &&
          requestPayload.extra_body
            ? ((requestPayload.extra_body as Record<string, unknown>)
                .cached_content ??
              (requestPayload.extra_body as Record<string, unknown>)
                .cachedContent)
            : undefined;
        const cachedContent =
          (requestPayload.cached_content as string | undefined) ??
          (requestPayload.cachedContent as string | undefined) ??
          (cachedContentFromExtra as string | undefined);
        if (cachedContent) {
          requestPayload.cachedContent = cachedContent;
        }

        delete requestPayload.cached_content;
        if (
          requestPayload.extra_body &&
          typeof requestPayload.extra_body === "object"
        ) {
          delete (requestPayload.extra_body as Record<string, unknown>)
            .cached_content;
          delete (requestPayload.extra_body as Record<string, unknown>)
            .cachedContent;
          if (
            Object.keys(requestPayload.extra_body as Record<string, unknown>)
              .length === 0
          ) {
            delete requestPayload.extra_body;
          }
        }

        // Remove model from inner request
        if ("model" in requestPayload) {
          delete requestPayload.model;
        }

        const wrappedBody = {
          project: projectId,
          model: effectiveModel,
          request: requestPayload,
        };

        body = JSON.stringify(wrappedBody);
      }
    } catch (error) {
      console.error("Failed to transform Gemini request body:", error);
    }
  }

  if (streaming) {
    headers.set("Accept", "text/event-stream");
  }

  headers.set("User-Agent", CODE_ASSIST_HEADERS["User-Agent"]);
  headers.set("X-Goog-Api-Client", CODE_ASSIST_HEADERS["X-Goog-Api-Client"]);
  headers.set("Client-Metadata", CODE_ASSIST_HEADERS["Client-Metadata"]);

  return {
    url: transformedUrl,
    init: {
      ...originalInit,
      headers,
      body,
    },
    streaming,
    requestedModel: rawModel,
  };
}

/**
 * Prepares a standard Gemini API request (no transformation, just auth).
 */
export function prepareStandardGeminiRequest(
  originalUrl: string,
  originalInit: RequestInit | undefined,
  accessToken: string
): PreparedRequest {
  const headers = new Headers(originalInit?.headers ?? {});

  // Set auth header
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.delete("x-goog-api-key");
  headers.delete("x-api-key");

  // Check if streaming
  const isStreaming = originalUrl.includes("streamGenerateContent");
  if (isStreaming) {
    headers.set("Accept", "text/event-stream");
  }

  return {
    url: originalUrl,
    init: {
      ...originalInit,
      headers,
    },
    streaming: isStreaming,
  };
}
