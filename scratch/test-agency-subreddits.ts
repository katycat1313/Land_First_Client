import dotenv from "dotenv";
dotenv.config();

async function testSubreddit(sub: string) {
  console.log(`\n=== TESTING r/${sub} ===`);
  const headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*"
  };

  // 1. Fetch /new.json
  const newUrl = `https://www.reddit.com/r/${sub}/new.json?limit=10`;
  try {
    const res = await fetch(newUrl, { headers });
    console.log(`[GET /r/${sub}/new.json] Status: ${res.status}`);
    if (res.ok) {
      const data: any = await res.json();
      const children = data?.data?.children || [];
      console.log(`Found ${children.length} posts in r/${sub}:`);
      for (const child of children.slice(0, 5)) {
        const post = child.data;
        console.log(` - [${post.ups} upvotes] "${post.title}"`);
        console.log(`   Author: u/${post.author} | URL: https://reddit.com${post.permalink}`);
        if (post.selftext) {
          console.log(`   Snippet: ${post.selftext.substring(0, 120).replace(/\n/g, " ")}...`);
        }
      }
    }
  } catch (err: any) {
    console.error(`Failed to fetch r/${sub}:`, err.message);
  }
}

async function main() {
  await testSubreddit("agency");
  await testSubreddit("marketingagency");
  await testSubreddit("digitalmarketing");
}

main().catch(console.error);
