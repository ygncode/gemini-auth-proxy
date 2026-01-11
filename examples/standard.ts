/**
 * Example: Using the /gemini/* endpoint via proxy
 *
 * Both /codeassist/* and /gemini/* endpoints work the same way:
 * - Route through Code Assist API with OAuth
 * - Automatic token refresh
 * - Request/response transformation
 *
 * The two endpoints are provided for organizational flexibility.
 *
 * Run: bun run examples/standard.ts
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";

// Create a custom Google provider that routes through our proxy
const google = createGoogleGenerativeAI({
  baseURL: "http://localhost:8888/gemini",
  apiKey: "proxy", // Placeholder - proxy handles real auth
});

const model = google("gemini-3-flash-preview");

async function main() {
  console.log("Using /gemini/* endpoint via proxy...\n");

  try {
    const result = await generateText({
      model,
      prompt: "Write a short poem about Dalat in Vietnam.",
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
