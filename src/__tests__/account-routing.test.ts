import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatAccountRoutingHint,
  planAccountTools,
} from "../lib/blxckchat/account-routing.js";

test("list my contacts routes to account_query contacts", () => {
  const plan = planAccountTools("list my contacts");
  assert.ok(plan.tools.includes("account_query"));
  assert.equal(plan.action, "contacts");
  assert.equal(plan.target, "blxckbook");
});

test("who am I dating filters Dating status", () => {
  const plan = planAccountTools("who am I dating right now?");
  assert.equal(plan.action, "contacts");
  assert.equal(plan.relationshipStatus, "Dating");
});

test("my journal routes to journal action", () => {
  const plan = planAccountTools("show my journal entries");
  assert.equal(plan.action, "journal");
});

test("tell me about Alex captures contactName", () => {
  const plan = planAccountTools("tell me about Alex");
  assert.equal(plan.action, "contact");
  assert.equal(plan.contactName, "Alex");
});

test("NXT dates route to events on nxt target", () => {
  const plan = planAccountTools("what are my upcoming dates in NXT?");
  assert.equal(plan.action, "events");
  assert.equal(plan.target, "nxt");
});

test("vault summary routes to summary action", () => {
  const plan = planAccountTools("how many contacts do I have?");
  assert.equal(plan.action, "summary");
});

test("formatAccountRoutingHint includes account_query and no-fabrication rule", () => {
  const hint = formatAccountRoutingHint("list my contacts");
  assert.ok(hint);
  assert.match(hint!, /account_query/);
  assert.match(hint!, /never invent/i);
});