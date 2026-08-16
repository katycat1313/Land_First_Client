import dotenv from "dotenv";
dotenv.config();

import { GLOBAL_PAC_SYSTEM_PROMPT } from "../server/deepgram";

async function main() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  console.log("=== UPDATING DEEPGRAM AGENT TO DIRECT ACTIVE LISTENING ===");

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
          description: "Displays a lead card on screen.",
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
        model: "flux-general-en",
        eot_threshold: 0.6,
        eager_eot_threshold: 0.3
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

  const patchRes = await fetch(`https://api.deepgram.com/v1/projects/${pid}/agents/${agentUuid}`, {
    method: "PATCH",
    headers: {
      "Authorization": `Token ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      config: JSON.stringify(configObj),
      metadata: { title: "P.A.C. Partner Agent" }
    })
  });

  console.log(`PATCH Status: ${patchRes.status}`);
  if (patchRes.ok) {
    console.log("Successfully updated Deepgram Agent on remote Deepgram servers!");
  } else {
    console.error("Failed to patch agent:", await patchRes.text());
  }

  // Also check all other agents and update them
  const aRes = await fetch(`https://api.deepgram.com/v1/projects/${pid}/agents`, {
    headers: { "Authorization": `Token ${apiKey}` }
  });
  const allAgents = await aRes.json();
  console.log(`Total agents in project: ${allAgents.length}`);
  for (const a of allAgents) {
    const aId = a.agent_id || a.id || a.agent_uuid;
    if (aId && aId !== agentUuid) {
      console.log(`Updating secondary agent: ${aId}`);
      await fetch(`https://api.deepgram.com/v1/projects/${pid}/agents/${aId}`, {
        method: "PATCH",
        headers: {
          "Authorization": `Token ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          config: JSON.stringify(configObj),
          metadata: { title: "P.A.C. Partner Agent" }
        })
      });
    }
  }
}

main().catch(console.error);
