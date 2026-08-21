export type SocialPlatformProfile = {
  name: string;
  contentRules: string[];
  visualRules: string[];
  imageSize: "1536x1024" | "1024x1536" | "1024x1024";
};

const profiles: Record<string, SocialPlatformProfile> = {
  linkedin: {
    name: "LinkedIn",
    contentRules: ["Operator-to-operator tone", "Strong first two lines", "Short paragraphs", "One practical takeaway", "At most one restrained closing question"],
    visualRules: ["Premium editorial business scene", "One strong feed-readable subject", "Clean restrained business palette", "No in-image text, dashboards, or fake metrics"],
    imageSize: "1536x1024"
  },
  reddit: {
    name: "Reddit",
    contentRules: ["Lead with the useful answer", "Explain exact steps", "No promotional link", "No sales CTA", "Invite corrections or alternative approaches"],
    visualRules: ["Credible documentary-style workspace scene", "Practical community-resource feel", "Natural unpolished detail", "No in-image text, logo, or sales language"],
    imageSize: "1536x1024"
  },
  instagram: {
    name: "Instagram",
    contentRules: ["Immediate visual hook", "Concise caption", "Scannable steps", "Natural conversational close", "Avoid hashtag stuffing"],
    visualRules: ["Portrait-first editorial composition", "One clear focal subject", "Bold silhouette readable on a phone", "Leave safe margins for interface overlays and include no in-image text"],
    imageSize: "1024x1536"
  },
  facebook: {
    name: "Facebook",
    contentRules: ["Friendly local-business language", "Useful story or checklist", "Avoid cold-pitch tone", "End with one easy community question"],
    visualRules: ["Approachable real-world local-business scene", "Warm natural color", "Clear subject readable on mobile", "No text, checklist, or corporate stock-art collage"],
    imageSize: "1536x1024"
  },
  x: {
    name: "Twitter/X",
    contentRules: ["One sharp observation", "Compact wording", "Use a short thread only when steps require it", "No filler or engagement bait"],
    visualRules: ["Single cinematic visual proof", "Minimal elements", "High natural contrast", "Clear at small feed size with no in-image text"],
    imageSize: "1536x1024"
  }
};

export const getSocialPlatformProfile = (platform?: string): SocialPlatformProfile => {
  const normalized = String(platform || "linkedin").toLowerCase();
  if (normalized.includes("reddit")) return profiles.reddit;
  if (normalized.includes("instagram")) return profiles.instagram;
  if (normalized.includes("facebook") || normalized.includes("meta")) return profiles.facebook;
  if (normalized === "x" || normalized.includes("twitter")) return profiles.x;
  return profiles.linkedin;
};

export const formatSocialPlatformProfilesForPrompt = () => Object.values(profiles)
  .map(profile => `${profile.name}: CONTENT: ${profile.contentRules.join("; ")}. VISUAL: ${profile.visualRules.join("; ")}.`)
  .join("\n");
