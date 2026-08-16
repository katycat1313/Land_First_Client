/**
 * Opportunity Radar - G14 Slingshot Crawler & Proxy Bridge
 * 
 * Run this on your ASUS G14 laptop or local machine to forward scraping requests
 * through your residential IP, completely bypassing datacenter IP bans (Reddit, Quora, etc.)
 * 
 * Usage:
 *   node g14-slingshot.js
 *   
 * To expose via Cloudflare Tunnel:
 *   cloudflared tunnel --url http://localhost:4000
 * 
 * To expose via Pinggy:
 *   ssh -p 443 -R0:localhost:4000 a.pinggy.io
 * 
 * To expose via ngrok:
 *   ngrok http 4000
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");

const PORT = process.env.SLINGSHOT_PORT || 4000;

const server = http.createServer(async (req, res) => {
  // Enable CORS for your published app
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);

  // Health check endpoint
  if (parsedUrl.pathname === "/" || parsedUrl.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "online",
      service: "G14 Slingshot Crawler Bridge",
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Proxy / Scraping Relay endpoint: /proxy?url=https://... or POST /proxy
  if (parsedUrl.pathname === "/proxy" || parsedUrl.pathname === "/crawl") {
    let targetUrl = parsedUrl.searchParams.get("url");

    if (req.method === "POST") {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", async () => {
        try {
          if (body) {
            const parsedBody = JSON.parse(body);
            if (parsedBody.url) targetUrl = parsedBody.url;
          }
          await executeFetch(targetUrl, req, res);
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON body", details: e.message }));
        }
      });
      return;
    }

    await executeFetch(targetUrl, req, res);
    return;
  }

  // Local LLM Relay / Proxy endpoint: POST /ollama
  if (parsedUrl.pathname === "/ollama" || parsedUrl.pathname.startsWith("/ollama/")) {
    const targetPath = parsedUrl.pathname.replace(/^\/ollama/, "") || "/api/chat";
    const localOllamaUrl = `http://localhost:11434${targetPath}`;
    console.log(`[G14 Slingshot] 🤖 Relaying LLM request (${req.method}) to local Ollama: ${localOllamaUrl}`);

    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const response = await fetch(localOllamaUrl, {
          method: req.method,
          headers: { "Content-Type": "application/json" },
          body: req.method !== "GET" && req.method !== "HEAD" ? body : undefined
        });

        const responseText = await response.text();
        res.writeHead(response.status, { "Content-Type": "application/json" });
        res.end(responseText);
        console.log(`[G14 Slingshot] 🤖 Relayed response from local Ollama (Status: ${response.status})`);
      } catch (err) {
        console.error(`[G14 Slingshot] ❌ Local Ollama relay error:`, err.message);
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Local Ollama is offline or unreachable.", details: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Endpoint not found. Use /health or /proxy?url=<TARGET_URL>" }));
});

async function executeFetch(targetUrl, clientReq, clientRes) {
  if (!targetUrl) {
    clientRes.writeHead(400, { "Content-Type": "application/json" });
    clientRes.end(JSON.stringify({ error: "Missing 'url' query parameter or JSON body." }));
    return;
  }

  console.log(`[G14 Slingshot] 🚀 Relaying residential request to: ${targetUrl}`);

  try {
    const fetchHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      "Accept": "application/json, text/xml, application/xml, text/html, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache"
    };

    const response = await fetch(targetUrl, {
      headers: fetchHeaders,
      redirect: "follow"
    });

    const contentType = response.headers.get("content-type") || "text/plain";
    const responseText = await response.text();

    console.log(`[G14 Slingshot] ✅ Fetched ${targetUrl} (Status: ${response.status}, Size: ${responseText.length} bytes)`);

    clientRes.writeHead(response.status, {
      "Content-Type": contentType,
      "X-Slingshot-Status": "relayed",
      "X-Target-Status": String(response.status)
    });
    clientRes.end(responseText);
  } catch (err) {
    console.error(`[G14 Slingshot] ❌ Fetch error for ${targetUrl}:`, err.message);
    clientRes.writeHead(502, { "Content-Type": "application/json" });
    clientRes.end(JSON.stringify({
      error: "G14 Slingshot fetch failed",
      targetUrl,
      details: err.message
    }));
  }
}

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`⚡ G14 Slingshot Crawler Bridge is RUNNING on port ${PORT}`);
  console.log(`🚀 Ready to relay live Reddit, Quora, and forum requests!`);
  console.log(`🔗 Local Health Check: http://localhost:${PORT}/health`);
  console.log(`====================================================`);
});
