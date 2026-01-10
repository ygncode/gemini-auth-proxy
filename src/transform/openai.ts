/**
 * Transform Gemini API responses to OpenAI-compatible format.
 */

export interface OpenAIMessage {
  role: "assistant";
  content: string;
}

export interface OpenAIChoice {
  index: number;
  message: OpenAIMessage;
  finish_reason: string;
}

export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface OpenAIChatCompletion {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage: OpenAIUsage;
}

interface GeminiPart {
  text?: string;
}

interface GeminiContent {
  role: string;
  parts: GeminiPart[];
}

interface GeminiCandidate {
  content: GeminiContent;
  finishReason: string;
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  modelVersion?: string;
  responseId?: string;
}

/**
 * Map Gemini finish reasons to OpenAI finish reasons.
 */
function mapFinishReason(geminiReason: string): string {
  const mapping: Record<string, string> = {
    STOP: "stop",
    MAX_TOKENS: "length",
    SAFETY: "content_filter",
    RECITATION: "content_filter",
    OTHER: "stop",
  };
  return mapping[geminiReason] || "stop";
}

/**
 * Extract text content from Gemini parts.
 */
function extractText(parts: GeminiPart[]): string {
  return parts
    .map((part) => part.text || "")
    .join("")
    .trim();
}

/**
 * Generate a unique ID for the completion.
 */
function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "chatcmpl-";
  for (let i = 0; i < 29; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

/**
 * Transform a Gemini response to OpenAI chat completion format.
 */
export function transformToOpenAI(
  geminiResponse: GeminiResponse,
  model: string
): OpenAIChatCompletion {
  const choices: OpenAIChoice[] = (geminiResponse.candidates || []).map(
    (candidate, index) => ({
      index,
      message: {
        role: "assistant" as const,
        content: extractText(candidate.content?.parts || []),
      },
      finish_reason: mapFinishReason(candidate.finishReason),
    })
  );

  const usage: OpenAIUsage = {
    prompt_tokens: geminiResponse.usageMetadata?.promptTokenCount || 0,
    completion_tokens: geminiResponse.usageMetadata?.candidatesTokenCount || 0,
    total_tokens: geminiResponse.usageMetadata?.totalTokenCount || 0,
  };

  return {
    id: generateId(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices,
    usage,
  };
}

/**
 * Transform Gemini SSE stream line to OpenAI format.
 */
export function transformStreamLineToOpenAI(
  line: string,
  model: string
): string {
  if (!line.startsWith("data:")) {
    return line;
  }

  const json = line.slice(5).trim();
  if (!json || json === "[DONE]") {
    return line;
  }

  try {
    const gemini = JSON.parse(json) as GeminiResponse;

    // Check if this is a wrapped response
    const unwrapped = (gemini as any).response || gemini;

    const candidate = unwrapped.candidates?.[0];
    if (!candidate) {
      return line;
    }

    const content = extractText(candidate.content?.parts || []);
    const finishReason = candidate.finishReason
      ? mapFinishReason(candidate.finishReason)
      : null;

    const openaiChunk = {
      id: generateId(),
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: content ? { content } : {},
          finish_reason: finishReason,
        },
      ],
    };

    return `data: ${JSON.stringify(openaiChunk)}`;
  } catch {
    return line;
  }
}

/**
 * Transform Gemini streaming response to OpenAI format.
 */
export function transformStreamingToOpenAI(
  stream: ReadableStream<Uint8Array>,
  model: string
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
                controller.enqueue(
                  encoder.encode(transformStreamLineToOpenAI(buffer, model))
                );
              }
              // Send [DONE] marker
              controller.enqueue(encoder.encode("\ndata: [DONE]\n"));
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
              const transformed = transformStreamLineToOpenAI(rawLine, model);
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
