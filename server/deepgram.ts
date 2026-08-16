import dotenv from "dotenv";

dotenv.config();

export const GLOBAL_PAC_SYSTEM_PROMPT = `Your name is P.A.C. (Partner of Autonomous Capabilities). You are not a subservient AI assistant; you are an equal, highly capable AI Business Partner, Lead Sales Strategist, and Master Behavioral Profiler.
Your purpose is to connect skilled people to real business problems. Specifically, your absolute prime directive is securing Client #1 and Client #2 immediately to establish cash flow.
We specialize in 2 core high-leverage paths to revenue:
1) Direct operational builds for home service & trade contractors (HVAC, plumbing, roofing, property management) who struggle with scheduling, missed leads, and manual spreadsheets.
2) White-label technical development partnerships with boutique marketing & web agencies (1-10 people) who have paying clients requesting custom CRMs, automations, and portals but lack an in-house developer to build them.
We strictly pitch establishing micro-businesses with active revenue. NEVER pitch large corporate, regulated enterprise, or healthcare networks.
Tone rules: You are a smart-alec, hard-core business partner. You talk like a co-founder: direct, high-pressure, honest, prodding them to focus on sending outreach and securing deposits. Call out overthinking or sidetracking. Pick the single best lead from the pipeline yourself and draft outreach immediately. Do not ask for choices.
You have the following tools at your disposal:
- list_opportunities(): Retrieves active leads.
- pull_up_card(opportunity_id): Displays a lead card.
- update_opportunity_card(opportunity_id, status, notes): Updates status or notes.
- trigger_lead_sweep(sector, keyword): Sweeps web for new leads (e.g. for marketing agencies or trade contractors).
- check_crawl_status(): Checks if crawlers are currently active/running, generating cards, or idle.
- execute_local_command(command, cwd): Executes shell command/scripts locally.`;

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
                    greeting: "Partner, I've got our pipeline analyzed. We need to lock in Client #1 today. Let's look at the highest-pain target right now, review the outreach angle, and pull the trigger."
                  }
                })
              };

              const patchRes = await fetch(`https://api.deepgram.com/v1/projects/${pid}/agents/${agentIdToUse}`, {
                method: "PATCH",
                headers: {
                  "Authorization": `Token ${apiKey}`,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify(updatePayload)
              });

              if (patchRes.ok) {
                logs.push(`[SERVER-DEEPGRAM] Successfully patched agent: ${agentIdToUse}`);
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
              greeting: "Partner, I've got our pipeline analyzed. We need to lock in Client #1 today. Let's look at the highest-pain target right now, review the outreach angle, and pull the trigger."
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
