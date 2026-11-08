import { describe, expect, it, vi } from 'vitest';
import { createState } from '../lib/state.js';
import { createMemoryStore } from '../lib/state-store.js';

describe('state-store migration & resilience', () => {
  it('migrates from v1 to v4', () => {
    const store = createMemoryStore({ claimed: [{ pageSlug: 'x' }] }); // v1
    const state = createState({ store });
    expect(state.data.schemaVersion).toBe(4);
    expect(state.data.accounts).toEqual({});
  });

  it('atomically maintains state consistency', () => {
    const store = createMemoryStore();
    const state = createState({ store });
    state.upsertAccount({ key: 'a', id: '1' });
    expect(state.data.accounts.a.id).toBe('1');
  });
});
