import dotenv from "dotenv";
dotenv.config();

import { GLOBAL_PAC_SYSTEM_PROMPT } from "../server/deepgram";

async function main() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  const pRes = await fetch("https://api.deepgram.com/v1/projects", {
    headers: { "Authorization": `Token ${apiKey}` }
  });
  const pData: any = await pRes.json();
  const pid = pData.projects[0].project_id;
  const agentUuid = "da7846d3-9d99-416b-9107-a543153fa100";

  const configObj = {
    think: {
      provider: { type: "open_ai", model: "gpt-4o-mini" },
      prompt: GLOBAL_PAC_SYSTEM_PROMPT,
      functions: [
        {
          name: "list_opportunities",
          description: "Retrieves active leads.",
          parameters: { type: "object", properties: {} }
        },
        {
          name: "pull_up_card",
          description: "Displays a lead card.",
          parameters: {
            type: "object",
            properties: {
              opportunity_id: { type: "string" }
            },
            required: ["opportunity_id"]
          }
        },
        {
          name: "trigger_lead_sweep",
          description: "Triggers bot fleet crawlers.",
          parameters: { type: "object", properties: {} }
        }
      ]
    },
    listen: {
      provider: {
        type: "deepgram",
        version: "v2",
        model: "flux-general-en"
      }
    },
    speak: {
      provider: {
        type: "deepgram",
        model: "aura-2-jupiter-en"
      }
    },
    greeting: "Hey, I'm here. What's on your mind?"
  };

  // Try PUT
  const putRes = await fetch(`https://api.deepgram.com/v1/projects/${pid}/agents/${agentUuid}`, {
    method: "PUT",
    headers: {
      "Authorization": `Token ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      config: JSON.stringify(configObj),
      metadata: { title: "P.A.C. Partner Agent" }
    })
  });
  console.log(`PUT Status: ${putRes.status}`);
  if (putRes.ok) {
    console.log("PUT succeeded!");
  } else {
    console.log("PUT error:", await putRes.text());
  }

  // Create a brand new agent with POST
  const postRes = await fetch(`https://api.deepgram.com/v1/projects/${pid}/agents`, {
    method: "POST",
    headers: {
      "Authorization": `Token ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      config: JSON.stringify(configObj),
      metadata: { title: "P.A.C. Direct Partner" }
    })
  });
  console.log(`POST Status: ${postRes.status}`);
  if (postRes.ok) {
    const newAgent = await postRes.json();
    console.log("New Agent Created successfully:", newAgent);
  } else {
    console.log("POST error:", await postRes.text());
  }
}

main().catch(console.error);
