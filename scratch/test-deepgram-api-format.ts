import dotenv from "dotenv";
dotenv.config();

async function main() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  console.log("=== TESTING DEEPGRAM AGENT API ===");
  const pRes = await fetch("https://api.deepgram.com/v1/projects", {
    headers: { "Authorization": `Token ${apiKey}` }
  });
  const pData: any = await pRes.json();
  const pid = pData.projects[0].project_id;
  console.log(`Project ID: ${pid}`);

  const aRes = await fetch(`https://api.deepgram.com/v1/projects/${pid}/agents`, {
    headers: { "Authorization": `Token ${apiKey}` }
  });
  console.log(`GET Agents Status: ${aRes.status}`);
  const aData = await aRes.json();
  console.log("Agents list:", JSON.stringify(aData, null, 2));

  // If agent exists, let's see its details:
  const firstAgent = Array.isArray(aData) ? aData[0] : (aData.agents ? aData.agents[0] : aData);
  const agentId = firstAgent?.agent_id || firstAgent?.id || firstAgent?.agent_uuid;
  console.log(`Agent ID: ${agentId}`);

  if (agentId) {
    const detailRes = await fetch(`https://api.deepgram.com/v1/projects/${pid}/agents/${agentId}`, {
      headers: { "Authorization": `Token ${apiKey}` }
    });
    console.log(`GET Detail Status: ${detailRes.status}`);
    console.log("Agent detail:", await detailRes.text());
  }
}

main().catch(console.error);
