import {
  extractUsageMetadata,
  parseGeminiApiBody,
  rewriteGeminiPreviewAccessError,
  type GeminiApiBody,
} from "./helpers";

/**
 * Rewrites SSE payload lines so downstream consumers see only the inner `response` objects.
 */
function transformStreamingLine(line: string): string {
  if (!line.startsWith("data:")) {
    return line;
  }
  const json = line.slice(5).trim();
  if (!json) {
    return line;
  }
  try {
    const parsed = JSON.parse(json) as { response?: unknown };
    if (parsed.response !== undefined) {
      return `data: ${JSON.stringify(parsed.response)}`;
    }
  } catch (_) {}
  return line;
}

/**
 * Streams SSE payloads, rewriting data lines on the fly.
 */
function transformStreamingPayloadStream(
  stream: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      reader = stream.getReader();
      const pump = (): void => {
        reader!
          .read()
          .then(({ done, value }) => {
            if (done) {
              buffer += decoder.decode();
              if (buffer.length > 0) {
                controller.enqueue(encoder.encode(transformStreamingLine(buffer)));
              }
              controller.close();
              return;
            }

            buffer += decoder.decode(value, { stream: true });

            let newlineIndex = buffer.indexOf("\n");
            while (newlineIndex !== -1) {
              const line = buffer.slice(0, newlineIndex);
              buffer = buffer.slice(newlineIndex + 1);
              const hasCarriageReturn = line.endsWith("\r");
              const rawLine = hasCarriageReturn ? line.slice(0, -1) : line;
              const transformed = transformStreamingLine(rawLine);
              const suffix = hasCarriageReturn ? "\r\n" : "\n";
              controller.enqueue(encoder.encode(`${transformed}${suffix}`));
              newlineIndex = buffer.indexOf("\n");
            }

            pump();
          })
          .catch((error) => {
            controller.error(error);
          });
      };

      pump();
    },
    cancel(reason) {
      if (reader) {
        reader.cancel(reason).catch(() => {});
      }
    },
  });
}

/**
 * Normalizes Code Assist responses: applies retry headers, extracts cache usage into headers,
 * rewrites preview errors, rewrites streaming payloads.
 */
export async function transformCodeAssistResponse(
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

  try {
    const headers = new Headers(response.headers);
    // Remove content-encoding since we're returning uncompressed content
    headers.delete("content-encoding");
    headers.delete("content-length");

    if (streaming && response.ok && isEventStreamResponse && response.body) {
      return new Response(transformStreamingPayloadStream(response.body), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    const text = await response.text();

    if (!response.ok && text) {
      try {
        const errorBody = JSON.parse(text);
        if (errorBody?.error?.details && Array.isArray(errorBody.error.details)) {
          const retryInfo = errorBody.error.details.find(
            (detail: any) =>
              detail["@type"] === "type.googleapis.com/google.rpc.RetryInfo"
          );

          if (retryInfo?.retryDelay) {
            const match = retryInfo.retryDelay.match(/^([\d.]+)s$/);
            if (match && match[1]) {
              const retrySeconds = parseFloat(match[1]);
              if (!isNaN(retrySeconds) && retrySeconds > 0) {
                const retryAfterSec = Math.ceil(retrySeconds).toString();
                const retryAfterMs = Math.ceil(retrySeconds * 1000).toString();
                headers.set("Retry-After", retryAfterSec);
                headers.set("retry-after-ms", retryAfterMs);
              }
            }
          }
        }
      } catch (parseError) {}
    }

    const init = {
      status: response.status,
      statusText: response.statusText,
      headers,
    };

    const parsed: GeminiApiBody | null =
      !streaming || !isEventStreamResponse ? parseGeminiApiBody(text) : null;
    const patched = parsed
      ? rewriteGeminiPreviewAccessError(parsed, response.status, requestedModel)
      : null;
    const effectiveBody = patched ?? parsed ?? undefined;

    const usage = effectiveBody ? extractUsageMetadata(effectiveBody) : null;
    if (usage?.cachedContentTokenCount !== undefined) {
      headers.set(
        "x-gemini-cached-content-token-count",
        String(usage.cachedContentTokenCount)
      );
      if (usage.totalTokenCount !== undefined) {
        headers.set("x-gemini-total-token-count", String(usage.totalTokenCount));
      }
      if (usage.promptTokenCount !== undefined) {
        headers.set(
          "x-gemini-prompt-token-count",
          String(usage.promptTokenCount)
        );
      }
      if (usage.candidatesTokenCount !== undefined) {
        headers.set(
          "x-gemini-candidates-token-count",
          String(usage.candidatesTokenCount)
        );
      }
    }

    if (!parsed) {
      return new Response(text, init);
    }

    if (effectiveBody?.response !== undefined) {
      return new Response(JSON.stringify(effectiveBody.response), init);
    }

    if (patched) {
      return new Response(JSON.stringify(patched), init);
    }

    return new Response(text, init);
  } catch (error) {
    console.error("Failed to transform Gemini response:", error);
    return response;
  }
}
