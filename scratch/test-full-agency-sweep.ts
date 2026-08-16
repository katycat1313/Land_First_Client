import dotenv from "dotenv";
dotenv.config();

import { scrapeRedditPublicJSON } from "../server/scrapers";
import { generateUnifiedLLM, safeParseJSON } from "../server/llm";

async function main() {
  console.log("=== EXECUTING TARGETED REAL MARKETING AGENCY SWEEP ===");
  
  // 1. Scrape authentic Reddit agency posts
  const posts = await scrapeRedditPublicJSON("client reporting onboarding automation webhook CRM dev", "Marketing agency");
  console.log(`[Scraper] Retrieved ${posts.length} authentic posts from agency subreddits!`);
  
  for (const p of posts) {
    console.log(`\n📌 Post: "${p.title}" (Platform: ${p.sourcePlatform})`);
    console.log(`   URL: ${p.sourceUrl}`);
    console.log(`   Author: u/${p.author}`);
    console.log(`   Text Snippet: ${p.text.substring(0, 180).replace(/\n/g, " ")}...`);
  }

  // 2. Pass to Gemini 3.1 Flash Lite
  console.log("\n🤖 [Gemini AI Extraction] Analyzing authentic agency signals...");
  const prompt = `You are the lead Opportunity Analysis Engine for a custom software & automation consultancy.
Analyze the following real community posts from marketing agency founders and operators:

${JSON.stringify(posts, null, 2)}

Return a JSON array of qualified opportunity cards. Each card must have:
- title: concise summary of their operational bottleneck / white-label dev need
- author: the poster username
- sourcePlatform: source subreddit
- sourceUrl: exact post URL
- problemSummary: what friction or bottleneck they face
- whoIsExperiencing: target role (e.g. Marketing Agency Founder, PPC Lead)
- industry: "Marketing & Creative Agencies"
- evidence: exact excerpt from their post
- painLevel: "High" | "Medium"
- possibleSolution: specific custom solution we can build (e.g. automated reporting pipeline, client onboarding webhook, white-label client portal)
- opportunityScore: number from 70 to 98
- responseDraft: high-value, down-to-earth conversational outreach offering practical advice without corporate jargon

Return JSON only.`;

  const responseText = await generateUnifiedLLM({
    systemPrompt: "You extract structured business opportunities from authentic forum posts. Return raw JSON array only.",
    prompt,
    responseJson: true
  });

  const qualified = safeParseJSON(responseText || "[]");
  console.log(`\n⭐ [GEMINI QUALIFIED LEADS]: Extracted ${qualified.length} Agency Opportunities!`);
  
  for (const opp of qualified) {
    console.log(`\n🎯 Lead: "${opp.title}" (Score: ${opp.opportunityScore})`);
    console.log(`   Author: u/${opp.author} | URL: ${opp.sourceUrl}`);
    console.log(`   Problem: ${opp.problemSummary}`);
    console.log(`   Proposed Build: ${opp.possibleSolution}`);
  }
}

main().catch(console.error);
