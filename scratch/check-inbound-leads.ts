import dotenv from "dotenv";
dotenv.config();

import { getSupabase } from "../server/db";

async function main() {
  console.log("=== CHECKING INBOUND LEADS & FORMS IN SUPABASE ===");
  const db = getSupabase();
  if (!db) {
    console.error("No Supabase connection.");
    return;
  }

  // Check opportunities table for inbound leads
  const { data: opps, error } = await db
    .from("opportunities")
    .select("*")
    .or("status.eq.Inbound Lead,title.ilike.%INBOUND%,source_platform.ilike.%Inbound%");

  if (error) {
    console.error("Query error:", error);
  } else {
    console.log(`Inbound leads found in database: ${opps?.length || 0}`);
    for (const o of opps || []) {
      console.log(` - [${o.id}] "${o.title}" (Author: ${o.author}, Email: ${o.contact_email || o.author})`);
    }
  }

  // Check all opportunities
  const { data: allOpps } = await db.from("opportunities").select("id, title, status, created_at");
  console.log(`\nTotal opportunities in database: ${allOpps?.length || 0}`);
}

main().catch(console.error);
