import dotenv from "dotenv";
dotenv.config();

import { loadBotConfig, loadOpportunities } from "../server/db";
import { executeBotFleetSweep } from "../server/scrapers";

async function main() {
  console.log("=== RUNNING LIVE BOT SWEEP TEST ===");
  const config = loadBotConfig();
  console.log("Enabled platforms in config:", config.platforms.filter((p: any) => p.isEnabled).map((p: any) => p.platformName));

  const result = await executeBotFleetSweep(config, {
    platform: "reddit",
    sector: "Marketing agency",
    keyword: "CRM webhook automation",
    budgetMax: 6
  });

  console.log("Sweep Logs:");
  for (const log of result.logs) {
    console.log(" -", log);
  }

  console.log(`Found ${result.foundOpps.length} opportunities:`);
  for (const opp of result.foundOpps) {
    console.log(` * [${opp.industry}] ${opp.title} (Author: ${opp.author}) - Score: ${opp.opportunityScore}`);
    console.log(`   Response draft: ${opp.responseDraft?.substring(0, 100)}...`);
  }
}

main().catch(console.error);
