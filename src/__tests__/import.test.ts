import assert from 'node:assert/strict';
import { test } from 'node:test';

import { importContacts } from '../lib/contacts.js';
import type { ContactInsert } from '../lib/types.js';

type MockResult = { error: { code: string; message: string; details: string; hint: string } | null; data: unknown };

function createMockSupabase(handlers: {
  batch?: () => MockResult;
  singles?: MockResult[];
}) {
  let singleIndex = 0;
  let batchUsed = false;

  return {
    from() {
      return {
        insert() {
          if (!batchUsed && handlers.batch) {
            batchUsed = true;
            return {
              select: async () => handlers.batch!(),
            };
          }

          const result = handlers.singles?.[singleIndex] ?? { error: null, data: null };
          singleIndex += 1;
          return Promise.resolve(result);
        },
      };
    },
  };
}

const samplePayload: ContactInsert[] = [
  { name: 'Alex', user_id: 'user_1' },
  { name: 'Jordan', user_id: 'user_1' },
];

test('importContacts returns batch count on success', async () => {
  const supabase = createMockSupabase({
    batch: () => ({ error: null, data: [{ id: '1' }, { id: '2' }] }),
  });

  const imported = await importContacts(supabase as never, samplePayload, false);
  assert.equal(imported, 2);
});

test('importContacts returns zero on duplicate without force', async () => {
  const supabase = createMockSupabase({
    batch: () => ({
      error: { code: '23505', message: 'duplicate key', details: '', hint: '' },
      data: null,
    }),
  });

  const imported = await importContacts(supabase as never, samplePayload, false);
  assert.equal(imported, 0);
});

test('importContacts skips duplicates when force is enabled', async () => {
  const supabase = createMockSupabase({
    batch: () => ({
      error: { code: '23505', message: 'duplicate key', details: '', hint: '' },
      data: null,
    }),
    singles: [
      { error: { code: '23505', message: 'duplicate key', details: '', hint: '' }, data: null },
      { error: null, data: { id: '2' } },
    ],
  });

  const imported = await importContacts(supabase as never, samplePayload, true);
  assert.equal(imported, 1);
});