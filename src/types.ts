export interface SolutionOption {
  id: string;
  rank: number; // e.g., 1, 2, 3
  title: string;
  type: 'automation' | 'mvp' | 'integration' | 'consulting' | 'custom' | 'saas';
  description: string;
  techStackSuggested: string;
  oneTimeFee: number; // e.g. 1500 for a build charge
  subscriptionFee: number; // e.g. 49/mo
  consultingFee: number; // e.g. 150/hr or 500/mo retainer
  timeToBuild: string; // e.g., "3 days", "2 weeks"
  difficulty: 'Easy' | 'Medium' | 'Hard';
  feasibilityScore: number; // 0-100
  pros: string[];
  cons: string[];
}

export interface Opportunity {
  id: string;
  title: string;
  author: string;
  sourcePlatform: string; // e.g., "Reddit", "Hacker News", "GitHub", "Niche Forum", "Local Business"
  sourceUrl: string;
  timestamp: string;
  
  // The 13 required components of an Opportunity Card
  problemSummary: string;
  originalSourceLink: string; // duplicate of sourceUrl or specific thread
  whoIsExperiencing: string;
  industry: string;
  evidence: string;
  painLevel: 'High' | 'Medium' | 'Low';
  painLevelExplanation: string;
  frequency: string;
  currentSolutions: string;
  possibleSolution: string;
  mvpIdea: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  difficultyExplanation: string;
  willingnessToPay: string;
  opportunityScore: number; // 0 - 100

  // Relationship & Engagement System
  responseDraft: string;
  suggestedQuestions: string[];
  valueAdditionIdeas: string[];
  
  // Post Classification (Help Seeker vs Solution Sharer vs Noise)
  classification?: 'help_seeker' | 'solution_sharer' | 'noise';
  
  // Personal Lead Tracking & CRM
  status: 'New' | 'Saved' | 'Contacted' | 'Replied' | 'In Discussion' | 'Potential Product' | 'Archived';
  notes: string;
  followUpDate?: string; // ISO string or YYYY-MM-DD
  contactedDate?: string;
  contactEmail?: string;
  lastInteraction?: string;
  estimatedDealValue?: number;

  // Autonomous Deep Business Research & News Signals
  companyResearch?: {
    newsSignals?: string[];
    employeePainPoints?: string[];
    icebreakers?: string[];
    keyTechStack?: string[];
    companySize?: string;
    recentEvents?: string;
    researchedAt?: string;
  };

  // Follow-up Sequence Engine
  followUpSequences?: {
    id: string;
    step: number;
    type: 'Email' | 'Call' | 'LinkedIn';
    subject: string;
    body: string;
    scheduledDate: string;
    sent: boolean;
  }[];

  // Multi-option solution paths & detailed billing estimates (one-time build fee, subscription, etc.)
  solutionOptions?: SolutionOption[];
  fullPostText?: string;

  // Gmail engagement sync fields
  gmailThreadId?: string;
  gmailMessageId?: string;
  gmailSentTo?: string;
  gmailLastSynced?: string;
}

export interface Stats {
  totalDiscovered: number;
  saved: number;
  contacted: number;
  inDiscussion: number;
  productIdeas: number;
  followupsPending: number;
}
