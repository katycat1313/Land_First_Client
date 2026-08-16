import dotenv from "dotenv";
dotenv.config();

import { GoogleGenAI } from "@google/genai";

async function main() {
  const apiKey = process.env.GEMINI_API_KEY || "";
  const ai = new GoogleGenAI({ apiKey });

  const testModels = ["gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-flash-latest", "gemini-3.7-flash"];
  for (const m of testModels) {
    try {
      const res = await ai.models.generateContent({
        model: m,
        contents: "Say 'Gemini is online!'"
      });
      console.log(`✅ Model '${m}' works! Output: ${res.text?.trim()}`);
    } catch (e: any) {
      console.log(`❌ Model '${m}' failed: ${e.message}`);
    }
  }
}

main().catch(console.error);
