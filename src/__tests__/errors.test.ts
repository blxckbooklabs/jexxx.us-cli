import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isDuplicateError, sanitizeDbError } from '../lib/errors.js';

test('isDuplicateError detects postgres unique violations', () => {
  assert.equal(isDuplicateError({ code: '23505', message: 'duplicate' }), true);
  assert.equal(isDuplicateError({ code: '42501', message: 'unique constraint' }), true);
  assert.equal(isDuplicateError({ code: '42501', message: 'permission denied' }), false);
});

test('sanitizeDbError avoids leaking raw database payloads', () => {
  const duplicate = sanitizeDbError({
    code: '23505',
    message: 'duplicate key value violates unique constraint "contacts_pkey"',
  });

  assert.match(duplicate, /Duplicate entry/);
  assert.doesNotMatch(duplicate, /secret-row/);
});