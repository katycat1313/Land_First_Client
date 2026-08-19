export interface GiveawayBlueprint {
  id: string;
  name: string;
  bestFor: string;
  evidenceRequired: string[];
  neverUseWhen: string[];
  setupMinutes: number;
  completeInstructions: string[];
  successCheck: string;
  optionalLargerWork: string;
}

// These are intentionally small, reversible, no-code fixes. They must remain
// useful even if the recipient never replies or hires us for anything else.
export const GIVEAWAY_BLUEPRINTS: GiveawayBlueprint[] = [
  {
    id: "gmail-lead-label",
    name: "Automatically organize new lead emails in Gmail",
    bestFor: "A small business that loses website inquiries, quote requests, or booking emails in a crowded Gmail inbox.",
    evidenceRequired: [
      "They explicitly mention missed, buried, or slow email follow-up.",
      "Their lead notifications arrive in Gmail from a consistent sender or contain a consistent subject phrase."
    ],
    neverUseWhen: [
      "Their leads do not arrive by email.",
      "The sender or subject cannot be identified reliably.",
      "They use a shared regulated or compliance-sensitive inbox."
    ],
    setupMinutes: 10,
    completeInstructions: [
      "Open one real lead email in Gmail and choose More, then Filter messages like these.",
      "Keep the reliable sender address. If the sender varies, use a phrase that always appears in the subject instead.",
      "Choose Create filter, then select Apply the label and create a new label named NEW LEADS.",
      "Also select Always mark it as important. Do not select Delete it, Skip the Inbox, or automatically send a reply.",
      "Create the filter, submit one test inquiry, and confirm the message stays in the Inbox with the NEW LEADS label."
    ],
    successCheck: "A test inquiry remains visible in the Inbox and receives the NEW LEADS label automatically.",
    optionalLargerWork: "A separate custom lead-response system could later track response time, assign ownership, send approved follow-ups, and report recovered revenue."
  },
  {
    id: "google-form-lead-alert",
    name: "Create a simple lead form with instant owner notifications",
    bestFor: "A business collecting inquiries through scattered texts, DMs, or incomplete contact messages.",
    evidenceRequired: [
      "They explicitly mention missing customer details or receiving incomplete inquiries.",
      "They already use or are comfortable using Google Workspace."
    ],
    neverUseWhen: [
      "The form would collect medical, financial, identity, payment, or other sensitive information.",
      "They already have a functioning website form or CRM intake process.",
      "They need routing across several employees or locations."
    ],
    setupMinutes: 15,
    completeInstructions: [
      "Create a blank Google Form with only Name, Phone or Email, Service Needed, and Preferred Contact Time.",
      "Mark Name, one contact method, and Service Needed as required. Do not request passwords, payment details, medical information, or identity documents.",
      "Open Responses, link the form to a new Google Sheet, then open the three-dot menu and enable Get email notifications for new responses.",
      "Use Send to copy the public form link and place it only where the business already accepts inquiries.",
      "Submit one test response and confirm the owner receives the notification and the row appears in the Sheet."
    ],
    successCheck: "One test submission produces both an owner email notification and a complete row in the response Sheet.",
    optionalLargerWork: "A separate custom intake system could later qualify leads, route them by service area, update a CRM, schedule estimates, and measure conversion."
  },
  {
    id: "meta-instant-reply",
    name: "Set a clear instant reply for Facebook and Instagram messages",
    bestFor: "A local business whose customers complain about slow Facebook or Instagram message responses.",
    evidenceRequired: [
      "There is authentic recent evidence of slow replies or unanswered Facebook or Instagram messages.",
      "The business actively uses a Facebook Page or connected Instagram business account."
    ],
    neverUseWhen: [
      "The business does not use Meta channels for customer inquiries.",
      "The message would promise response times the business cannot meet.",
      "The business needs emergency, medical, financial, or safety-related triage."
    ],
    setupMinutes: 10,
    completeInstructions: [
      "Open Meta Business Suite, go to Inbox, then Automations, and choose Instant reply.",
      "Select only the Facebook Page and Instagram account that the owner actively monitors.",
      "Use this plain message: Thanks for reaching out. We received your message. Please send the service you need, your ZIP code, and the best number to reach you. We will reply during our posted business hours.",
      "Do not promise an exact response time unless the business consistently meets it, and do not request payment or sensitive information.",
      "Save it, send one test message from a separate account, and confirm the reply appears once with the correct business hours."
    ],
    successCheck: "A test DM receives one accurate instant reply without requesting sensitive information or making an unrealistic promise.",
    optionalLargerWork: "A separate custom messaging workflow could later qualify requests, detect service area, create CRM leads, schedule callbacks, and provide staff handoff."
  }
];

export const formatGiveawayBlueprintsForPrompt = () => GIVEAWAY_BLUEPRINTS
  .map(blueprint => `
BLUEPRINT ID: ${blueprint.id}
NAME: ${blueprint.name}
BEST FOR: ${blueprint.bestFor}
EVIDENCE REQUIRED: ${blueprint.evidenceRequired.join(" | ")}
NEVER USE WHEN: ${blueprint.neverUseWhen.join(" | ")}
COMPLETE SETUP: ${blueprint.completeInstructions.map((step, index) => `${index + 1}. ${step}`).join(" ")}
SUCCESS CHECK: ${blueprint.successCheck}
OPTIONAL, SEPARATE LARGER WORK: ${blueprint.optionalLargerWork}
  `.trim())
  .join("\n\n");

export const selectGiveawayBlueprints = (opportunity: any): GiveawayBlueprint[] => {
  const evidence = [
    opportunity?.title,
    opportunity?.problemSummary,
    opportunity?.evidence,
    opportunity?.fullPostText,
    opportunity?.currentSolutions
  ].filter(Boolean).join(" ").toLowerCase();

  // Do not recommend these starter automations in regulated or sensitive contexts.
  if (/hospital|healthcare|medical|patient|hipaa|bank|financial|insurance claim|legal case/.test(evidence)) {
    return [];
  }

  const matches: string[] = [];
  const hasResponsePain = /missed|buried|lost|unanswered|slow (reply|response)|follow[- ]?up|overlook/.test(evidence);
  if (hasResponsePain && /gmail|email|inbox|quote request|website inquir/.test(evidence)) {
    matches.push("gmail-lead-label");
  }
  if (/google form|google sheet|google workspace/.test(evidence) && /missing (details|information)|incomplete inquir|scattered (text|dm|message)|lead intake|contact form/.test(evidence)) {
    matches.push("google-form-lead-alert");
  }
  if (hasResponsePain && /facebook|instagram|meta business|social dm|direct message/.test(evidence)) {
    matches.push("meta-instant-reply");
  }

  return matches
    .map(id => GIVEAWAY_BLUEPRINTS.find(blueprint => blueprint.id === id))
    .filter((blueprint): blueprint is GiveawayBlueprint => Boolean(blueprint));
};
