import assert from "node:assert/strict";
import { test } from "node:test";

import { getJexxxusApiBaseUrl } from "../lib/account-data/jexxxus-api-client.js";

test("getJexxxusApiBaseUrl defaults to live API when unset", () => {
  const prevUrl = process.env.JEXXXUS_API_URL;
  const prevFlag = process.env.JEXXXUS_ACCOUNT_API;
  delete process.env.JEXXXUS_API_URL;
  delete process.env.JEXXXUS_ACCOUNT_API_URL;
  delete process.env.JEXXXUS_ACCOUNT_API;
  try {
    assert.equal(getJexxxusApiBaseUrl(), "https://api.jexxx.us");
  } finally {
    if (prevUrl === undefined) delete process.env.JEXXXUS_API_URL;
    else process.env.JEXXXUS_API_URL = prevUrl;
    if (prevFlag === undefined) delete process.env.JEXXXUS_ACCOUNT_API;
    else process.env.JEXXXUS_ACCOUNT_API = prevFlag;
  }
});

test("getJexxxusApiBaseUrl respects JEXXXUS_API_URL override", () => {
  const prev = process.env.JEXXXUS_API_URL;
  process.env.JEXXXUS_API_URL = "http://127.0.0.1:8787/";
  try {
    assert.equal(getJexxxusApiBaseUrl(), "http://127.0.0.1:8787");
  } finally {
    if (prev === undefined) delete process.env.JEXXXUS_API_URL;
    else process.env.JEXXXUS_API_URL = prev;
  }
});

test("getJexxxusApiBaseUrl returns null when JEXXXUS_ACCOUNT_API=off", () => {
  const prev = process.env.JEXXXUS_ACCOUNT_API;
  process.env.JEXXXUS_ACCOUNT_API = "off";
  try {
    assert.equal(getJexxxusApiBaseUrl(), null);
  } finally {
    if (prev === undefined) delete process.env.JEXXXUS_ACCOUNT_API;
    else process.env.JEXXXUS_ACCOUNT_API = prev;
  }
});