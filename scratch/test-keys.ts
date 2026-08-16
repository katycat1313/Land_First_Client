import dotenv from "dotenv";
dotenv.config();
import { createClient } from "@supabase/supabase-js";

async function testKey(name: string, key: string) {
  const url = process.env.SUPABASE_URL || "https://nxbfbwtbvaqcvgsovged.supabase.co";
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.from("opportunities").select("id, title");
  console.log(`Key: ${name} -> ${error ? "Error: " + error.message : "Success: " + data?.length + " rows"}`);
}

async function main() {
  await testKey("SUPABASE_API_KEY", process.env.SUPABASE_API_KEY || "");
  await testKey("SUPABASE_PUBLISHABLE_KEY", process.env.SUPABASE_PUBLISHABLE_KEY || "");
}

main().catch(console.error);
