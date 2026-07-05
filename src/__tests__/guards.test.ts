import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getImportOwnerError } from '../lib/guards.js';

test('getImportOwnerError blocks SYSTEM without override', () => {
  const message = getImportOwnerError('SYSTEM', false);
  assert.match(message ?? '', /SYSTEM/);
});

test('getImportOwnerError allows SYSTEM with dev override', () => {
  assert.equal(getImportOwnerError('SYSTEM', true), null);
});

test('getImportOwnerError allows explicit clerk user id', () => {
  assert.equal(getImportOwnerError('user_2abc123', false), null);
});