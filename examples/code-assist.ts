/**
 * Example: Using the Code Assist API via proxy
 *
 * This uses the /codeassist/* endpoint which:
 * - Transforms requests to the Code Assist API format
 * - Wraps request body with project ID
 * - Unwraps response body
 *
 * Run: bun run examples/code-assist.ts
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";

// Create a custom Google provider that routes through our proxy
const google = createGoogleGenerativeAI({
  baseURL: "http://localhost:8888/codeassist",
  apiKey: "proxy", // Placeholder - proxy handles real auth
});

const model = google("gemini-3-flash-preview");

async function main() {
  console.log("Using Code Assist API via proxy...\n");

  try {
    const result = await generateText({
      model,
      prompt: "Write a haiku about programming.",
    });

    console.log("Response:");
    console.log("─".repeat(40));
    console.log(result.text);
    console.log("─".repeat(40));
    console.log("\nUsage:", result.usage);
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error:", error.message);
      if (error.message.includes("UNAUTHENTICATED")) {
        console.log("\nPlease log in at http://localhost:8888/ui first.");
      }
    } else {
      console.error("Error:", error);
    }
  }
}

main();
