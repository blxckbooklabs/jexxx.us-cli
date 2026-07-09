import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertAllowedVeilPublicBaseUrl,
  readPublicMarkdownFile,
} from "../lib/veil-security.js";

test("assertAllowedVeilPublicBaseUrl permits veil.jexxx.us", () => {
  assert.equal(
    assertAllowedVeilPublicBaseUrl("https://veil.jexxx.us/"),
    "https://veil.jexxx.us",
  );
});

test("assertAllowedVeilPublicBaseUrl blocks internal SSRF hosts", () => {
  assert.throws(
    () => assertAllowedVeilPublicBaseUrl("https://169.254.169.254/"),
    /not allowed/i,
  );
});

test("readPublicMarkdownFile blocks traversal", () => {
  assert.throws(
    () => readPublicMarkdownFile("/tmp", "../etc/passwd.md"),
    /Blocked unsafe content path/i,
  );
});