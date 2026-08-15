import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("❌ GEMINI_API_KEY is missing from environment.");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

async function main() {
  try {
    console.log("Testing generation with gemini-2.5-flash...");
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "Hi! Reply with 'OK' if you can read this.",
    });
    console.log("✅ Success! Response:", response.text);
  } catch (err: any) {
    console.error("❌ Error with gemini-2.5-flash:", err.message || err);
  }

  try {
    console.log("\nTesting generation with gemini-3.6-flash...");
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: "Hi! Reply with 'OK' if you can read this.",
    });
    console.log("✅ Success! Response:", response.text);
  } catch (err: any) {
    console.error("❌ Error with gemini-3.6-flash:", err.message || err);
  }
}

main();
