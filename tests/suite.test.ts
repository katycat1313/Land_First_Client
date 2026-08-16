import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import dotenv from "dotenv";
dotenv.config();

import {
  scoreBuyerIntent,
  cleanHtmlAndCdata,
  createSubrequestBudget,
  consumeSubrequestBudget,
  scrapeRSSFeed,
  scrapeDiscourse,
  executeBotFleetSweep
} from "../server/scrapers";
import { generateUnifiedLLM, safeParseJSON, getGeminiClient } from "../server/llm";
import { loadBotConfig, loadOpportunities } from "../server/db";

describe("Opportunity Radar Comprehensive Test Suite", () => {

  describe("1. Subrequest Budget & Safety Controls", () => {
    it("should initialize budget correctly", () => {
      const budget = createSubrequestBudget(5);
      assert.equal(budget.remaining, 5);
      assert.equal(budget.tunnelDead.mac, false);
      assert.equal(budget.tunnelDead.g14, false);
    });

    it("should decrement budget on consume and abort when exhausted", () => {
      const budget = createSubrequestBudget(2);
      assert.equal(consumeSubrequestBudget(budget, "fetch 1"), true);
      assert.equal(budget.remaining, 1);
      assert.equal(consumeSubrequestBudget(budget, "fetch 2"), true);
      assert.equal(budget.remaining, 0);
      assert.equal(consumeSubrequestBudget(budget, "fetch 3 (exceeded)"), false);
      assert.equal(budget.remaining, 0);
    });
  });

  describe("2. Buyer Intent & Frustration Scoring", () => {
    it("should award positive points for urgency, frustration, and buying intent", () => {
      const urgentText = "I need an automated tool asap. We are losing money and willing to pay for a solution.";
      const { score, signals } = scoreBuyerIntent(urgentText);
      assert.ok(score >= 7, `Expected score >= 7, got ${score}`);
      assert.ok(signals.some(s => s.includes("urgency")), "Should detect urgency");
      assert.ok(signals.some(s => s.includes("buyer-intent")), "Should detect buyer intent");
    });

    it("should penalize promotional pitches and self-marketing", () => {
      const promoText = "Check out my new app! I built a tool for beta users with a discount code.";
      const { score, signals } = scoreBuyerIntent(promoText);
      assert.ok(score < 0, `Expected negative score for promo, got ${score}`);
      assert.ok(signals.some(s => s.includes("promotional")), "Should detect promotional signal");
    });

    it("should score agency development distress signals favorably", () => {
      const agencyText = "Our marketing agency is looking to hire a developer to build custom webhook integrations for our client.";
      const { score, signals } = scoreBuyerIntent(agencyText);
      assert.ok(score >= 4, `Expected positive score for agency hiring, got ${score}`);
    });
  });

  describe("3. HTML / XML & CDATA Sanitization", () => {
    it("should clean HTML tags and CDATA blocks", () => {
      const raw = "<![CDATA[<p>Hello <b>World</b> &amp; Partners</p>]]>";
      const cleaned = cleanHtmlAndCdata(raw);
      assert.equal(cleaned, "Hello World & Partners");
    });

    it("should escape common HTML entities", () => {
      const raw = "It&#39;s a &#x27;nightmare&#x27; &quot;quote&quot; &lt;problem&gt;";
      const cleaned = cleanHtmlAndCdata(raw);
      assert.equal(cleaned, "It's a 'nightmare' \"quote\" <problem>");
    });
  });

  describe("4. Live Forum & RSS Scrapers (Cloud-Bypass)", () => {
    it("should successfully fetch authentic entries from Google News RSS proxy", async () => {
      const budget = createSubrequestBudget(4);
      const url = "https://news.google.com/rss/search?q=site:community.shopify.com+workflow&hl=en-US&gl=US&ceid=US:en";
      const hits = await scrapeRSSFeed(url, "Shopify Community RSS", budget);
      assert.ok(Array.isArray(hits), "Hits should be an array");
      assert.ok(hits.length > 0, "Should retrieve at least 1 authentic RSS item");
      assert.ok(hits[0].title, "First hit must have a title");
      assert.ok(hits[0].sourceUrl.startsWith("http"), "Source URL must be valid HTTP link");
    });

    it("should successfully fetch authentic topics from Make Discourse forum", async () => {
      const budget = createSubrequestBudget(4);
      const hits = await scrapeDiscourse("community.make.com", "webhook", "Marketing agency", undefined, budget);
      assert.ok(Array.isArray(hits), "Discourse hits should be an array");
      assert.ok(hits.length > 0, "Should retrieve authentic topics from Make community");
      assert.ok(hits[0].sourceUrl.includes("community.make.com"), "URL must point to Make forum");
    });
  });

  describe("5. Gemini AI Engine & JSON Opportunity Extraction", () => {
    it("should initialize Gemini client with API key", () => {
      const ai = getGeminiClient();
      assert.ok(ai, "Gemini client must be initialized");
    });

    it("should extract structured opportunity cards via Unified LLM in 1 call", async () => {
      const samplePosts = [
        {
          title: "Struggling to connect our client's legacy CRM to Facebook lead ads",
          author: "agency_owner_99",
          sourcePlatform: "Reddit (r/marketingagency)",
          sourceUrl: "https://reddit.com/r/marketingagency/comments/sample1",
          text: "We run a boutique ad agency with 6 retainer clients. Our newest client uses an archaic custom database and our team spent 15 hours trying to automate the CSV export. We need a reliable white label dev partner to build this integration ASAP."
        }
      ];

      const prompt = `
        Analyze these posts and extract genuine opportunities in JSON:
        ${JSON.stringify(samplePosts)}

        Return JSON array:
        [{
          "title": "Exact title",
          "author": "author",
          "sourcePlatform": "platform",
          "sourceUrl": "url",
          "classification": "help_seeker",
          "problemSummary": "1-sentence summary",
          "whoIsExperiencing": "Agency Owner",
          "industry": "Marketing agency",
          "evidence": "quote",
          "painLevel": "High",
          "painLevelExplanation": "15 hours wasted",
          "frequency": "Daily",
          "currentSolutions": "Manual CSV",
          "possibleSolution": "Custom webhook pipeline",
          "mvpIdea": "2-week MVP",
          "difficulty": "Medium",
          "difficultyExplanation": "Legacy API",
          "willingnessToPay": "$1000-$2000 project",
          "opportunityScore": 90,
          "responseDraft": "White label pitch to agency owner",
          "suggestedQuestions": ["Q1"],
          "valueAdditionIdeas": ["Idea1"]
        }]
      `;

      const response = await generateUnifiedLLM({ prompt, responseJson: true });
      assert.ok(response, "LLM must return a non-empty response");
      const parsed = safeParseJSON(response);
      assert.ok(Array.isArray(parsed), "Parsed output must be an array");
      assert.ok(parsed.length > 0, "Must extract at least 1 opportunity");
      assert.equal(parsed[0].classification, "help_seeker");
      assert.ok(parsed[0].responseDraft.length > 20, "Response draft must be generated");
    });
  });

  describe("6. Bot Fleet Single-Site Sweep Execution", () => {
    it("should execute targeted single-site sweep and return structured logs and opps", async () => {
      const config = loadBotConfig();
      const result = await executeBotFleetSweep(config, {
        platform: "rss",
        sector: "Marketing agency",
        keyword: "client automation",
        budgetMax: 4
      });

      assert.ok(result, "Result object should exist");
      assert.ok(Array.isArray(result.logs), "Logs should be an array");
      assert.ok(result.logs.length > 0, "Logs must record sweep steps");
      assert.ok(Array.isArray(result.foundOpps), "foundOpps should be an array");
    });
  });

  describe("7. Database Integrity & Authentic Signals", () => {
    it("should load opportunity database without corrupted records", () => {
      const opps = loadOpportunities();
      assert.ok(Array.isArray(opps), "Opportunities must be an array");
      for (const opp of opps.slice(0, 10)) {
        assert.ok(opp.id, "Opportunity must have an ID");
        assert.ok(opp.title, "Opportunity must have a title");
        assert.ok(opp.problemSummary || opp.evidence, "Opportunity must contain evidence or summary");
      }
    });
  });
});
