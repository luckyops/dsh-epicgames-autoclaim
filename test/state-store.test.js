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

  it('atomically maintains state consistency and notifies Observer subscribers', () => {
    const store = createMemoryStore();
    const state = createState({ store });
    const notifications = [];
    const unsubscribe = state.subscribe(snapshot => {
      notifications.push(snapshot.accounts.a?.id ?? null);
    });
    state.upsertAccount({ key: 'a', id: '1' });
    expect(state.data.accounts.a.id).toBe('1');
    expect(notifications).toEqual(['1']);
    unsubscribe();
    state.upsertAccount({ key: 'a', id: '2' });
    expect(notifications).toEqual(['1']);
  });

  it('tracks superseded profile keys when consolidating duplicate accounts by id', () => {
    const store = createMemoryStore();
    const state = createState({ store });
    state.upsertAccount({ key: 'anonymous-1', id: 'shared-id', name: 'Old' });
    state.upsertAccount({ key: 'shared-id', id: 'shared-id', name: 'New' });
    expect(Object.keys(state.data.accounts)).toEqual(['shared-id']);
    expect(state.drainSupersededProfileKeys()).toEqual(['anonymous-1']);
    expect(state.drainSupersededProfileKeys()).toEqual([]);
  });
});
