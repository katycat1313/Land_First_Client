import dotenv from "dotenv";
dotenv.config();

async function testFirecrawlAgency() {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  console.log("=== TESTING FIRECRAWL SCRAPER ON r/marketingagency ===");
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      url: "https://www.reddit.com/r/marketingagency/new/",
      formats: ["markdown"]
    })
  });

  console.log(`[Firecrawl Status]: ${res.status}`);
  if (res.ok) {
    const data: any = await res.json();
    const markdown = data?.data?.markdown || "";
    console.log(`Markdown retrieved: ${markdown.length} chars`);
    const lines = markdown.split("\n").filter((l: string) => l.startsWith("# ") || l.startsWith("## ") || l.includes("r/marketingagency"));
    console.log("Post titles / headings extracted by Firecrawl:");
    for (const l of lines.slice(0, 8)) {
      console.log(` - ${l}`);
    }
  } else {
    console.error(await res.text());
  }
}

testFirecrawlAgency().catch(console.error);
