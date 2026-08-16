import dotenv from "dotenv";
dotenv.config();

import { GoogleGenAI } from "@google/genai";

async function main() {
  const apiKey = process.env.GEMINI_API_KEY || "";
  const ai = new GoogleGenAI({ apiKey });

  const candidateModels = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-2.5-pro"
  ];

  for (const m of candidateModels) {
    try {
      const res = await ai.models.generateContent({
        model: m,
        contents: "Say 'Hello from Gemini'"
      });
      console.log(`✅ Model '${m}' works! Output: ${res.text?.trim()}`);
    } catch (e: any) {
      console.log(`❌ Model '${m}' failed: ${e.message}`);
    }
  }
}

main().catch(console.error);
