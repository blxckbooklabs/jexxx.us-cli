import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatAccountRoutingHint,
  isVaultPrimaryPrompt,
  isVaultReadOnlyPrompt,
  isVaultWritePrompt,
  planAccountTools,
} from "../lib/blxckchat/account-routing.js";

test("list my contacts routes to account_query contacts", () => {
  const plan = planAccountTools("list my contacts");
  assert.ok(plan.tools.includes("account_query"));
  assert.equal(plan.action, "contacts");
  assert.equal(plan.target, "blxckbook");
});

test("who are my current contacts routes to account_query contacts", () => {
  const plan = planAccountTools("Who are my current contacts?");
  assert.ok(plan.tools.includes("account_query"));
  assert.equal(plan.action, "contacts");
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

test("my TV playlists routes to playlists action", () => {
  const plan = planAccountTools("show my TV playlists");
  assert.equal(plan.action, "playlists");
});

test("videos in playlist captures playlistName", () => {
  const plan = planAccountTools("what is in my playlist Late Night");
  assert.equal(plan.action, "playlist");
  assert.equal(plan.playlistName, "Late Night");
});

test("Docs and Law does not route to account_query contact lookup", () => {
  const prompt = "What can you tell me about Docs and Law?";
  const plan = planAccountTools(prompt);
  assert.equal(plan.tools.length, 0);
  assert.equal(plan.contactName, null);
  assert.equal(isVaultPrimaryPrompt(prompt), false);
  assert.equal(formatAccountRoutingHint(prompt), null);
});

test("tell me about Docs alone does not capture contactName", () => {
  const plan = planAccountTools("tell me about Docs");
  assert.equal(plan.contactName, null);
  assert.ok(!plan.tools.includes("account_query"));
});

test("formatAccountRoutingHint includes account_query and no-fabrication rule", () => {
  const hint = formatAccountRoutingHint("list my contacts");
  assert.ok(hint);
  assert.match(hint!, /account_query/);
  assert.match(hint!, /never invent/i);
});

test("BLXCKBOOK contacts capability question routes to account_query contacts", () => {
  const prompt =
    "Do you have the ability to tell me who my contacts are in BLXCKBOOK?";
  const plan = planAccountTools(prompt);
  assert.ok(plan.tools.includes("account_query"));
  assert.equal(plan.action, "contacts");
  assert.equal(plan.target, "blxckbook");
  assert.equal(isVaultPrimaryPrompt(prompt), true);
});

test("who my contacts are in BLXCKBOOK routes to contacts action", () => {
  const plan = planAccountTools("who my contacts are in BLXCKBOOK");
  assert.equal(plan.action, "contacts");
  assert.equal(plan.target, "blxckbook");
});

test("BLXCKBOOK contacts capability is vault read-only", () => {
  const prompt =
    "Do you have the ability to tell me who my contacts are in BLXCKBOOK?";
  assert.equal(isVaultReadOnlyPrompt(prompt), true);
});

test("add contact to BLXCKBOOK is not vault read-only", () => {
  assert.equal(
    isVaultReadOnlyPrompt("add a new contact to my BLXCKBOOK named Alex"),
    false,
  );
});

test("contact named Ruth captures contactName and enables write tools", () => {
  const prompt = "Let's try with a contact named Ruth.";
  const plan = planAccountTools(prompt);
  assert.equal(plan.contactName, "Ruth");
  assert.equal(isVaultReadOnlyPrompt(prompt), false);
});

test("CRUD capability question enables write tools", () => {
  const prompt =
    "Do you have CRUD access, such as the ability to create a new test contact?";
  assert.equal(isVaultReadOnlyPrompt(prompt), false);
});

test("create contact named Ruth is a vault write prompt", () => {
  assert.equal(isVaultWritePrompt("Create a test contact named Ruth."), true);
});