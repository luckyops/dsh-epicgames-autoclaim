import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, createState, maskAccountId } from '../lib/state.js';

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

  it('migrates a version-1 document', () => {
    const file = tempState();
    writeFileSync(file, JSON.stringify({ claimed: [{ pageSlug: 'x', outcome: 'claimed' }] }));
    const state = createState(file);
    expect(state.data.schemaVersion).toBe(SCHEMA_VERSION);
    expect(state.data.claimed).toHaveLength(1);
    expect(state.data.consecutiveFailures).toBe(0);
  });

  it('survives a torn file by resetting to defaults', () => {
    const file = tempState();
    writeFileSync(file, '{not json');
    expect(createState(file).data.phase).toBe('idle');
  });
});

describe('hasClaimed account scoping', () => {
  it('blocks re-checking records of the current account', () => {
    const state = createState(tempState());
    state.data.accountId = 'acct-1';
    state.addClaimed({ offerId: 'o1', pageSlug: 's1', outcome: 'claimed', account: 'acct-1' });
    expect(state.hasClaimed(candidate('o1'))).toBe(true);
    expect(state.hasClaimed(candidate('o2'))).toBe(false);
  });

  it('stops blocking after the account changes', () => {
    const state = createState(tempState());
    state.data.accountId = 'acct-1';
    state.addClaimed({ offerId: 'o1', pageSlug: 's1', outcome: 'claimed', account: 'acct-1' });
    state.data.accountId = 'acct-2';
    expect(state.hasClaimed(candidate('o1'))).toBe(false);
  });

  it('treats legacy records without an account as the current account', () => {
    const state = createState(tempState());
    state.data.accountId = 'acct-1';
    state.addClaimed({ offerId: 'o1', pageSlug: 's1', outcome: 'claimed' });
    expect(state.hasClaimed(candidate('o1'))).toBe(true);
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
