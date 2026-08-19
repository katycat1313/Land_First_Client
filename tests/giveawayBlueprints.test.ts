import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GIVEAWAY_BLUEPRINTS, selectGiveawayBlueprints } from "../server/giveawayBlueprints";

describe("safe giveaway blueprint matching", () => {
  it("ships exactly three complete starter blueprints", () => {
    assert.equal(GIVEAWAY_BLUEPRINTS.length, 3);
    for (const blueprint of GIVEAWAY_BLUEPRINTS) {
      assert.ok(blueprint.completeInstructions.length >= 5);
      assert.ok(blueprint.successCheck.length > 20);
      assert.ok(blueprint.setupMinutes <= 15);
    }
  });

  it("matches Gmail only for explicit inbox response pain", () => {
    const matches = selectGiveawayBlueprints({
      evidence: "Our quote request emails keep getting buried in the Gmail inbox and follow-up is slow."
    });
    assert.deepEqual(matches.map(item => item.id), ["gmail-lead-label"]);
  });

  it("matches Meta only for explicit social-message response pain", () => {
    const matches = selectGiveawayBlueprints({
      evidence: "Customers say our Instagram direct messages go unanswered for too long."
    });
    assert.deepEqual(matches.map(item => item.id), ["meta-instant-reply"]);
  });

  it("returns no blueprint for vague operational pain", () => {
    assert.deepEqual(selectGiveawayBlueprints({ evidence: "We need to improve operations." }), []);
  });

  it("returns no blueprint for regulated contexts", () => {
    assert.deepEqual(selectGiveawayBlueprints({
      evidence: "Our patient appointment emails get buried in our healthcare office inbox."
    }), []);
  });
});
