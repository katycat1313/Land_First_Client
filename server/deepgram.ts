import dotenv from "dotenv";
import { DEEPGRAM_THINK_MODEL } from "./llm";

dotenv.config();

export const GLOBAL_PAC_SYSTEM_PROMPT = `You are P.A.C., an equal AI Business Partner & Lead Sales Strategist.
Rule 1: ACTIVE LISTENING. Acknowledge user input, answer specific questions directly, and never talk over them or recite irrelevant monologues.
Rule 2: VOICE ONLY. Never use asterisks (*) or markdown formatting (no bold/bullets) to avoid the voice synthesizer saying "star star". Use standard punctuation.
Rule 3: NO FLUFF. No AI buzzwords (delve, synergy, leverage, game-changer). Keep spoken turns short (2-4 sentences max).
Rule 4: TARGETS. Focus on micro-businesses (plumbers, HVAC, agencies, real estate). Exclude healthcare/corporates.
Rule 5: DELIVERY. We build custom MVPs, n8n/Zapier workflows, and voice bots using an AI agent fleet. DMs are sent by the user via 1-click browser deep-links, not background bots.
Rule 6: GOOGLE MAPS SCANNER. You have a BUILT-IN Google Maps scanner. When the user asks to find local leads, scan an area, find unclaimed or incomplete profiles, or research local businesses on Google Maps, you MUST call the scan_google_maps function immediately. NEVER say you cannot scan Google Maps or that you lack this tool. Valid categories: HVAC contractor, plumber, roofer, landscaper, electrician, real estate agency, property management company, marketing agency, recruiting agency. Set unclaimed_only to true when user wants unclaimed or incomplete profiles.
Tools: list_opportunities, pull_up_card, update_opportunity_card, trigger_lead_sweep, check_crawl_status, execute_local_command, scan_google_maps.`;

export async function setupDeepgramAgent(apiKey: string, projectId?: string, voice?: string, forceNew?: boolean): Promise<{ success: boolean; agentId?: string; logs: string[] }> {
  const logs: string[] = [];
  logs.push(`[SERVER-DEEPGRAM] Initiating secure server-side Deepgram Voice Agent setup...`);

  try {
    logs.push("[SERVER-DEEPGRAM] Fetching projects from Deepgram...");
    const projectsRes = await fetch("https://api.deepgram.com/v1/projects", {
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Content-Type": "application/json"
      }
    });

    if (!projectsRes.ok) {
      const errText = await projectsRes.text();
      throw new Error(`Failed to retrieve Deepgram projects (Status: ${projectsRes.status}) - ${errText}`);
    }

    const projectsData = (await projectsRes.json()) as any;
    let projects = projectsData.projects || [];

    const targetProjectId = projectId || process.env.DEEPGRAM_PROJECT_ID || process.env.VITE_DEEPGRAM_PROJECT_ID;
    if (targetProjectId) {
      const matched = projects.find((p: any) => (p.id || p.project_id) === targetProjectId);
      if (matched) projects = [matched];
      else projects = [{ id: targetProjectId, name: "Forced Target Project" }];
    }

    if (projects.length === 0) {
      throw new Error("No projects found in this Deepgram account.");
    }

    let agentIdToUse = "";

    if (!forceNew) {
      for (const project of projects) {
        const pid = project.id || project.project_id;
        if (!pid) continue;

        try {
          const agentsRes = await fetch(`https://api.deepgram.com/v1/projects/${pid}/agents`, {
            headers: {
              "Authorization": `Token ${apiKey}`,
              "Content-Type": "application/json"
            }
          });

          if (agentsRes.ok) {
            const agentsData = (await agentsRes.json()) as any;
            const existingAgents = Array.isArray(agentsData) ? agentsData : (agentsData.agents || []);
            const pacAgent = existingAgents.find((a: any) => a.metadata?.title === "P.A.C. Partner Agent" || a.name === "P.A.C. Partner Agent") || existingAgents[0];
            if (pacAgent) {
              agentIdToUse = pacAgent.agent_uuid || pacAgent.id || pacAgent.agent_id;
              logs.push(`[SERVER-DEEPGRAM] Updating existing agent ${agentIdToUse}...`);

              const updatePayload = {
                name: "Partner Agent",
                metadata: { title: "P.A.C. Partner Agent" },
                config: {
                  think: {
                    provider: { type: "google", model: DEEPGRAM_THINK_MODEL },
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
                        name: "update_opportunity_card",
                        description: "Updates details of a specific opportunity card.",
                        parameters: {
                          type: "object",
                          properties: {
                            opportunity_id: { type: "string" },
                            status: { type: "string" },
                            notes: { type: "string" },
                            contact_email: { type: "string" },
                            estimated_deal_value: { type: "number" }
                          },
                          required: ["opportunity_id"]
                        }
                      },
                      {
                        name: "trigger_lead_sweep",
                        description: "Triggers bot fleet crawlers.",
                        parameters: { type: "object", properties: {} }
                      },
                      {
                        name: "check_crawl_status",
                        description: "Checks if bot crawlers are currently active/running, generating cards, or idle.",
                        parameters: { type: "object", properties: {} }
                      },
                      {
                        name: "execute_local_command",
                        description: "Runs local shell command.",
                        parameters: {
                          type: "object",
                          properties: {
                            command: { type: "string" },
                            cwd: { type: "string" }
                          },
                          required: ["command"]
                        }
                      },
                      {
                        name: "scan_google_maps",
                        description: "Scans Google Maps / Google Places for local micro-businesses with incomplete, unclaimed, or low-engagement profiles. Returns scored leads with opportunity signals. Use whenever user asks to find local leads, scan Google Maps, or find unclaimed business profiles.",
                        parameters: {
                          type: "object",
                          properties: {
                            location: { type: "string", description: "City and state, e.g. Charlotte, NC" },
                            category: { type: "string", description: "Business category: HVAC contractor, plumber, roofer, landscaper, electrician, real estate agency, property management company, marketing agency, recruiting agency" },
                            unclaimed_only: { type: "boolean", description: "If true, return only businesses likely missing 3+ owner-controlled profile fields (unclaimed/incomplete profiles)" }
                          },
                          required: ["location", "category"]
                        }
                      }
                    ]
                  },
                  listen: {
                    provider: {
                      type: "deepgram",
                      version: "v2",
                      model: "flux-general-en",
                      eot_threshold: 0.5,
                      eager_eot_threshold: 0.3
                    }
                  },
                  speak: {
                    provider: {
                      type: "deepgram",
                      model: voice || "aura-2-jupiter-en",
                      ...((voice || "aura-2-jupiter-en").startsWith("flux-") ? { version: "v2" } : {})
                    }
                  },
                  greeting: "Hey, I'm here. What's on your mind?"
                }
              };

              const putRes = await fetch(`https://api.deepgram.com/v1/projects/${pid}/agents/${agentIdToUse}`, {
                method: "PUT",
                headers: {
                  "Authorization": `Token ${apiKey}`,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify(updatePayload)
              });

              if (putRes.ok) {
                logs.push(`[SERVER-DEEPGRAM] Successfully updated agent: ${agentIdToUse}`);
                break;
              } else {
                agentIdToUse = "";
              }
            }
          }
        } catch (e) {
          logs.push(`[SERVER-DEEPGRAM] Failed scanning project: ${e}`);
        }
      }
    }

    if (!agentIdToUse) {
      logs.push("[SERVER-DEEPGRAM] Generating new Agent ID...");
      for (const project of projects) {
        const pid = project.id || project.project_id;
        if (!pid) continue;

        const cleanVoice = voice || "aura-2-jupiter-en";
        const createPayload = {
          name: "Partner Agent",
          metadata: { title: "P.A.C. Partner Agent" },
          config: {
            think: {
              provider: { type: "google", model: DEEPGRAM_THINK_MODEL },
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
                  name: "update_opportunity_card",
                  description: "Updates a lead card.",
                  parameters: {
                    type: "object",
                    properties: {
                      opportunity_id: { type: "string" },
                      status: { type: "string" },
                      notes: { type: "string" },
                      contact_email: { type: "string" },
                      estimated_deal_value: { type: "number" }
                    },
                    required: ["opportunity_id"]
                  }
                },
                {
                  name: "trigger_lead_sweep",
                  description: "Triggers bot crawlers.",
                  parameters: { type: "object", properties: {} }
                },
                {
                  name: "check_crawl_status",
                  description: "Checks if bot crawlers are currently active/running, generating cards, or idle.",
                  parameters: { type: "object", properties: {} }
                },
                {
                  name: "execute_local_command",
                  description: "Runs shell command.",
                  parameters: {
                    type: "object",
                    properties: {
                      command: { type: "string" },
                      cwd: { type: "string" }
                    },
                    required: ["command"]
                  }
                },
                {
                  name: "scan_google_maps",
                  description: "Scans Google Maps / Google Places for local micro-businesses with incomplete, unclaimed, or low-engagement profiles. Returns scored leads with opportunity signals. Use whenever user asks to find local leads, scan Google Maps, or find unclaimed business profiles.",
                  parameters: {
                    type: "object",
                    properties: {
                      location: { type: "string", description: "City and state, e.g. Charlotte, NC" },
                      category: { type: "string", description: "Business category: HVAC contractor, plumber, roofer, landscaper, electrician, real estate agency, property management company, marketing agency, recruiting agency" },
                      unclaimed_only: { type: "boolean", description: "If true, return only businesses likely missing 3+ owner-controlled profile fields (unclaimed/incomplete profiles)" }
                    },
                    required: ["location", "category"]
                  }
                }
              ]
            },
            listen: {
              provider: {
                type: "deepgram",
                version: "v2",
                model: "flux-general-en",
                eot_threshold: 0.5,
                eager_eot_threshold: 0.3
              }
            },
            speak: {
              provider: {
                type: "deepgram",
                model: cleanVoice,
                ...(cleanVoice.startsWith("flux-") ? { version: "v2" } : {})
              }
            },
            greeting: "Hey, I'm here. What's on your mind?"
          }
        };

        const createRes = await fetch(`https://api.deepgram.com/v1/projects/${pid}/agents`, {
          method: "POST",
          headers: {
            "Authorization": `Token ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(createPayload)
        });

        if (createRes.ok) {
          const createData = (await createRes.json()) as any;
          agentIdToUse = createData.agent_uuid || createData.id || createData.agent_id;
          logs.push(`[SERVER-DEEPGRAM] Successfully created agent: ${agentIdToUse}`);
          break;
        }
      }
    }

    if (!agentIdToUse) {
      throw new Error("Failed to create agent on all projects.");
    }

    return { success: true, agentId: agentIdToUse, logs };
  } catch (err: any) {
    logs.push(`[SERVER-DEEPGRAM-ERR] Setup failed: ${err.message || err}`);
    return { success: false, logs };
  }
}
