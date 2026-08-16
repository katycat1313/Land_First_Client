import dotenv from "dotenv";
dotenv.config();

const BASE_URL = "https://missedrevenue.org";
const APP_PASSWORD = process.env.APP_PASSWORD || "";

async function main() {
  console.log(`=== TESTING LIVE PRODUCTION SWEEP ON ${BASE_URL} ===`);
  
  // 1. Trigger sweep
  console.log("[1] Triggering sweep on production...");
  const triggerRes = await fetch(`${BASE_URL}/api/bot-config/trigger-sweep`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-app-password": APP_PASSWORD
    },
    body: JSON.stringify({ sector: "Marketing agency", keyword: "CRM webhook automation" })
  });

  const triggerData = await triggerRes.json();
  console.log("[1] Trigger response:", triggerData);

  // 2. Poll status every 2 seconds
  console.log("[2] Polling live crawl status from production...");
  let attempts = 0;
  let lastLogCount = 0;

  while (attempts < 30) {
    attempts++;
    await new Promise(r => setTimeout(r, 2000));
    
    const statusRes = await fetch(`${BASE_URL}/api/crawl/status`, {
      headers: { "x-app-password": APP_PASSWORD }
    });
    
    if (!statusRes.ok) {
      console.log(`[Status HTTP ${statusRes.status}]`);
      continue;
    }

    const status = await statusRes.json();
    if (status.logs && status.logs.length > lastLogCount) {
      const newLogs = status.logs.slice(lastLogCount);
      for (const log of newLogs) {
        console.log("   LOG:", log);
      }
      lastLogCount = status.logs.length;
    }

    if (!status.active) {
      console.log(`\n[3] Sweep completed! Status: ${status.status}, Progress: ${status.progress}, Discovered: ${status.foundOppsCount}`);
      break;
    }
  }

  // 3. Fetch opportunities from production
  console.log("\n[4] Fetching opportunities from production database...");
  const oppsRes = await fetch(`${BASE_URL}/api/opportunities`, {
    headers: { "x-app-password": APP_PASSWORD }
  });
  const opps = await oppsRes.json();
  console.log(`Total opportunities in production DB: ${opps.length}`);
  for (const opp of opps.slice(0, 5)) {
    console.log(` - [${opp.industry || opp.status}] "${opp.title}" (Platform: ${opp.sourcePlatform})`);
  }
}

main().catch(console.error);
