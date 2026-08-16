import dotenv from "dotenv";
dotenv.config();

import { GoogleGenAI } from "@google/genai";

async function main() {
  const apiKey = process.env.GEMINI_API_KEY || "";
  const ai = new GoogleGenAI({ apiKey });

  const models = await ai.models.list();
  console.log("=== AVAILABLE MODELS FOR THIS GEMINI KEY ===");
  for await (const m of models) {
    console.log(` - ${m.name} (displayName: ${m.displayName})`);
  }
}

main().catch(console.error);
