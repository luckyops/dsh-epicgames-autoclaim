import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, createState, maskAccountId, profileKeyFor } from '../lib/state.js';

const dirs = [];
const tempState = () => {
  const dir = mkdtempSync(join(tmpdir(), 'ega-state-'));
  dirs.push(dir);
  return join(dir, 'state.json');
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const candidate = offerId => ({ offerId, pageSlug: `slug-${offerId}` });

describe('createState persistence', () => {
  it('starts from defaults and saves atomically under a schema version', () => {
    const file = tempState();
    const state = createState(file);
    expect(state.data.schemaVersion).toBe(SCHEMA_VERSION);
    state.data.accountName = 'player';
    state.save();
    const onDisk = JSON.parse(readFileSync(file, 'utf8'));
    expect(onDisk.accountName).toBe('player');
    expect(() => readFileSync(`${file}.tmp`, 'utf8')).toThrow(); // no temp residue
  });

  it('migrates a version-1 document and seeds the account registry', () => {
    const file = tempState();
    writeFileSync(file, JSON.stringify({ claimed: [{ pageSlug: 'x', outcome: 'claimed' }] }));
    const state = createState(file);
    expect(state.data.schemaVersion).toBe(SCHEMA_VERSION);
    expect(state.data.claimed).toHaveLength(1);
    expect(state.data.accounts).toEqual({});
  });

  it('survives a torn file by resetting to defaults', () => {
    const file = tempState();
    writeFileSync(file, '{not json');
    expect(createState(file).data.phase).toBe('idle');
  });
});

describe('hasClaimed per-account scoping', () => {
  it("blocks re-checking records of that account's key", () => {
    const state = createState(tempState());
    state.addClaimed({ offerId: 'o1', pageSlug: 's1', outcome: 'claimed', account: 'acct-1' });
    expect(state.hasClaimed(candidate('o1'), 'acct-1')).toBe(true);
    expect(state.hasClaimed(candidate('o2'), 'acct-1')).toBe(false);
  });

  it('never blocks a different account — every library audits itself', () => {
    const state = createState(tempState());
    state.addClaimed({ offerId: 'o1', pageSlug: 's1', outcome: 'claimed', account: 'acct-1' });
    expect(state.hasClaimed(candidate('o1'), 'acct-2')).toBe(false);
  });

  it('treats legacy records without an account as the current account\'s', () => {
    const state = createState(tempState());
    state.addClaimed({ offerId: 'o1', pageSlug: 's1', outcome: 'claimed' });
    expect(state.hasClaimed(candidate('o1'), 'acct-1')).toBe(true);
  });
});

describe('account registry', () => {
  it('upserts, mirrors the latest account into the display fields, and lists by recency', () => {
    const state = createState(tempState());
    state.upsertAccount({ key: 'a', id: 'id-a', name: 'A', loggedInAt: '2026-01-01T00:00:00Z' });
    state.upsertAccount({ key: 'b', id: 'id-b', name: 'B', loggedInAt: '2026-02-01T00:00:00Z' });
    state.upsertAccount({ key: 'a', id: 'id-a', name: 'A2', loggedInAt: '2026-03-01T00:00:00Z' });
    expect(state.data.accountName).toBe('A2'); // most recent upsert mirrors
    expect(state.accountList().map(account => account.key)).toEqual(['a', 'b']); // by recency
    expect(state.data.accounts.a.name).toBe('A2'); // refresh preserves the key's record
  });

  it('removes an account and reports whether it existed', () => {
    const state = createState(tempState());
    state.upsertAccount({ key: 'a', id: 'id-a', name: 'A' });
    expect(state.removeAccount('a')?.name).toBe('A');
    expect(state.removeAccount('a')).toBeNull();
    expect(state.accountList()).toHaveLength(0);
  });
});

describe('profileKeyFor', () => {
  it('sanitizes ids into filesystem-safe keys', () => {
    expect(profileKeyFor('abc123', null)).toBe('abc123');
    expect(profileKeyFor('we/ird:id*', null)).toBe('we-ird-id'); // trailing dashes trimmed
    expect(profileKeyFor(null, 'player one')).toMatch(/^named-player-one$/);
    expect(profileKeyFor(null, null)).toMatch(/^anonymous-/);
  });
});

describe('instance isolation', () => {
  it('never shares mutable containers between state instances', () => {
    const first = createState(tempState());
    first.upsertAccount({ key: 'a', id: 'id-a', name: 'A' });
    first.addClaimed({ offerId: 'o1', pageSlug: 's1', outcome: 'claimed', account: 'id-a' });
    first.event('claim.claimed', { title: 'x' });

    const second = createState(tempState());
    expect(second.accountList()).toHaveLength(0);
    expect(second.data.claimed).toHaveLength(0);
    expect(second.data.log).toHaveLength(0);
  });
});

describe('events', () => {
  it('stores structured entries and keeps the log bounded', () => {
    const state = createState(tempState());
    for (let index = 0; index < 80; index += 1) state.event('claim.claimed', { title: `g${index}` });
    expect(state.data.log.length).toBeLessThanOrEqual(60);
    expect(state.data.log[0]).toMatchObject({ code: 'claim.claimed', params: { title: 'g79' } });
  });
});

describe('maskAccountId', () => {
  it('masks long ids and passes short ones through', () => {
    expect(maskAccountId('abcdefghijklmnop')).toBe('abcdefgh…');
    expect(maskAccountId('short')).toBe('short');
    expect(maskAccountId(null)).toBeNull();
  });
});
