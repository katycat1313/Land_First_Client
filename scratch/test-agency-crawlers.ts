import dotenv from "dotenv";
dotenv.config();

async function testFirecrawl(url: string) {
  console.log(`\n=== TESTING FIRECRAWL ON ${url} ===`);
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.error("No FIRECRAWL_API_KEY");
    return;
  }

  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url,
        formats: ["markdown", "links"]
      })
    });

    console.log(`[Firecrawl] Status: ${res.status}`);
    if (res.ok) {
      const data: any = await res.json();
      const markdown = data?.data?.markdown || "";
      console.log(`Markdown length: ${markdown.length} chars`);
      console.log(`Snippet:\n${markdown.substring(0, 500)}`);
    } else {
      console.error(await res.text());
    }
  } catch (e: any) {
    console.error(`Firecrawl error: ${e.message}`);
  }
}

async function testRedditRssDirect(sub: string) {
  console.log(`\n=== TESTING REDDIT RSS FOR r/${sub} ===`);
  const feedUrl = `https://www.reddit.com/r/${sub}/new.rss?limit=10`;
  try {
    const res = await fetch(feedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml, application/xml, text/xml"
      }
    });
    console.log(`[Reddit RSS] Status: ${res.status}`);
    if (res.ok) {
      const xml = await res.text();
      console.log(`XML length: ${xml.length} chars`);
      const entryCount = (xml.match(/<entry>/g) || []).length;
      console.log(`Found ${entryCount} <entry> items in r/${sub}!`);
      
      const titles = xml.match(/<title>([^<]+)<\/title>/g) || [];
      for (const t of titles.slice(1, 6)) {
        console.log(` - ${t.replace(/<\/?title>/g, "")}`);
      }
    }
  } catch (e: any) {
    console.error(`Reddit RSS error: ${e.message}`);
  }
}

async function main() {
  await testRedditRssDirect("agency");
  await testRedditRssDirect("marketingagency");
  await testRedditRssDirect("digitalmarketing");
}

main().catch(console.error);
