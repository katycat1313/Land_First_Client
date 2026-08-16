import dotenv from "dotenv";
dotenv.config();

import { getSupabase, syncSupabaseOnStartup } from "../server/db";

async function main() {
  console.log("=== CHECKING SUPABASE CONNECTION & TABLES ===");
  const db = getSupabase();
  if (!db) {
    console.error("❌ getSupabase() returned null! Check SUPABASE_URL / SUPABASE_KEY.");
    return;
  }
  console.log("✅ Supabase client initialized.");

  const { data: opps, error: oppsErr } = await db.from("opportunities").select("*");
  if (oppsErr) {
    console.error("❌ Supabase opportunities error:", oppsErr);
  } else {
    console.log(`✅ Supabase opportunities count: ${opps.length}`);
    for (const o of opps.slice(0, 5)) {
      console.log(` - [${o.id}] "${o.title}" (source_url: ${o.source_url})`);
    }
  }

  const { data: config, error: cfgErr } = await db.from("bot_config").select("*");
  if (cfgErr) console.error("❌ Supabase bot_config error:", cfgErr);
  else console.log(`✅ Supabase bot_config count: ${config.length}`);
}

main().catch(console.error);
