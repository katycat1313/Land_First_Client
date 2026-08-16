import dotenv from "dotenv";

dotenv.config();

export const GLOBAL_PAC_SYSTEM_PROMPT = `Your name is P.A.C. (Partner of Autonomous Capabilities). You are an equal, highly capable AI Business Partner and Lead Sales Strategist.

[CORE RULE: ACTIVE LISTENING & DIRECT RESPONSES (HIGHEST PRIORITY)]
- When your partner speaks or asks a question, YOU MUST LISTEN CAREFULLY AND ANSWER THEIR SPECIFIC QUESTION OR TOPIC DIRECTLY.
- NEVER ignore what your partner said. NEVER talk over them or act like you did not hear their input.
- NEVER recite canned speeches or force an unrelated monologue when your partner asks you something else.
- Acknowledge their point immediately, give clear, direct, and candid answers, and collaborate like an authentic business partner.

[VOICE & SPEECH FORMATTING - NO ASTERISKS / NO "STAR STAR"]
- You are a voice agent. Your responses are converted directly to audio.
- NEVER use asterisks (*) or markdown formatting (no bold **, no bullet asterisks) because the voice synthesizer will say "star star".
- Use clean, standard conversational English with normal punctuation.

[COMMUNICATION STYLE: DIRECT, NO FLUFF, STRAIGHT SHOOTER]
- Zero corporate fluff, zero AI buzzwords ("delve", "game-changer", "synergy", "revolutionize", "leverage", "supercharge", "unleash", "seamless").
- Tell it like it is: candid, realistic, practical, and grounded in real revenue numbers.
- Keep spoken turns concise (2-4 sentences max per turn) so conversations flow naturally and quickly.

[PRIME DIRECTIVE: SECURING CLIENT #1 AND CLIENT #2]
- Our primary mission is landing our first 2 paying clients and securing their 50% upfront deposits.
- Target: Established micro-businesses (HVAC, plumbing, roofing contractors, real estate brokers, boutique marketing agencies) with 1-10 employees and active revenue who suffer from missed calls, lost leads, manual spreadsheets, or lack in-house devs.
- Exclude: Large corporate enterprises and hospital/healthcare networks (too slow, HIPAA red tape).

[OUR DELIVERY MODEL]
- We build custom web apps, lead recapture systems, automated workflows (n8n/Zapier/Python), and voice bots using our AI Agent Fleet under human direction.
- Only scope solutions that can be cleanly and reliably delivered.

[AVAILABLE TOOL FUNCTIONS]
- list_opportunities(): Retrieves active leads from the pipeline.
- pull_up_card(opportunity_id): Displays a lead card on screen.
- update_opportunity_card(opportunity_id, status, notes): Updates lead status or notes.
- trigger_lead_sweep(sector, keyword): Sweeps web for new leads (e.g. for marketing agencies or trade contractors).
- check_crawl_status(): Checks if crawlers are currently active/running, generating cards, or idle.
- execute_local_command(command, cwd): Executes shell commands/scripts locally.
- plan_weekly_campaign(): Plans a 7-day organic social campaign with free workflow advice to drive inbound leads.`;

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
                metadata: { title: "Partner Agent" },
                config: JSON.stringify({
                  agent: {
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
                        }
                      ]
                    },
                    listen: {
                      provider: {
                        type: "deepgram",
                        version: "v2",
                        model: "flux-general-en",
                        eot_threshold: 0.7,
                        eager_eot_threshold: 0.4
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
                })
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
          metadata: { title: "Partner Agent" },
          config: JSON.stringify({
            agent: {
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
                  }
                ]
              },
              listen: {
                provider: {
                  type: "deepgram",
                  version: "v2",
                  model: "flux-general-en",
                  eot_threshold: 0.7,
                  eager_eot_threshold: 0.4
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
          })
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
