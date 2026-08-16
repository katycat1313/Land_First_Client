import dotenv from "dotenv";
dotenv.config();

import { setupDeepgramAgent } from "../server/deepgram";

async function main() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    console.error("No DEEPGRAM_API_KEY in .env");
    return;
  }

  console.log("=== SYNCING DEEPGRAM VOICE AGENT SYSTEM PROMPT ===");
  const res = await setupDeepgramAgent(apiKey, undefined, undefined, false);
  console.log("Result:", res);
  for (const l of res.logs) {
    console.log(` - ${l}`);
  }
}

main().catch(console.error);
