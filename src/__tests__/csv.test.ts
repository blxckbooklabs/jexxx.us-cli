import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { parseCsvFile, rowToContact, rowsToContacts, splitList } from '../lib/csv.js';

test('splitList parses comma-separated tags', () => {
  assert.deepEqual(splitList('friend, tech ,'), ['friend', 'tech']);
  assert.deepEqual(splitList(''), []);
  assert.deepEqual(splitList(undefined), []);
});

test('rowToContact maps legacy headers and skips empty names', () => {
  assert.deepEqual(rowToContact({ Name: 'Alex', Bio: 'Note', Tags: 'a,b' }, 'user_1'), {
    name: 'Alex',
    notes: 'Note',
    tags: ['a', 'b'],
    user_id: 'user_1',
  });

  assert.equal(rowToContact({ name: '   ' }, 'user_1'), null);
});

test('rowsToContacts counts invalid rows', () => {
  const { contacts, skippedInvalid } = rowsToContacts(
    [{ Name: 'A' }, { Name: '' }, { name: 'B' }],
    'user_abc'
  );

  assert.equal(skippedInvalid, 1);
  assert.equal(contacts.length, 2);
  assert.equal(contacts[0]?.user_id, 'user_abc');
});

test('parseCsvFile reads trimmed CSV rows', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'jexxxus-cli-'));
  const file = join(dir, 'contacts.csv');

  try {
    await writeFile(
      file,
      'Name,Notes,Tags\nAlex Rivera,Met at conference,"friend, tech"\nJordan Lee,,\n'
    );

    const rows = await parseCsvFile(file);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.Name, 'Alex Rivera');
    assert.equal(rows[1]?.Name, 'Jordan Lee');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});