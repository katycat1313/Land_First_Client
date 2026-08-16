import dotenv from "dotenv";
dotenv.config();

import { scrapeRSSFeed } from "../server/scrapers";

async function testQuery(query: string, label: string) {
  console.log(`\n=== TESTING QUERY: ${query} ===`);
  const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const hits = await scrapeRSSFeed(feedUrl, label);
    console.log(`Retrieved ${hits.length} hits:`);
    for (const h of hits) {
      console.log(` - [${h.title}] (${h.sourceUrl})`);
    }
  } catch (e: any) {
    console.error(`Error: ${e.message}`);
  }
}

async function main() {
  await testQuery('site:reddit.com/r/agency OR site:reddit.com/r/marketingagency (client OR onboarding OR reporting OR integration OR automation)', 'Reddit Agency');
  await testQuery('site:reddit.com "marketing agency" (workflow OR bottleneck OR "white label" OR "developer")', 'Reddit Marketing Agency');
  await testQuery('site:reddit.com/r/smallbusiness "marketing agency"', 'Reddit SmallBusiness');
}

main().catch(console.error);
