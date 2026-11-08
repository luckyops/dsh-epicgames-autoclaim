import { describe, expect, it } from 'vitest';
import { derivePhase, nextRunAt } from '../lib/scheduler.js';
import { allowRequest } from '../lib/http-api.js';

describe('nextRunAt', () => {
  const hour = 3_600_000;
  const now = 1_000_000;

  it('schedules the plain interval', () => {
    expect(nextRunAt({ now, intervalHours: 12 })).toBe(now + 12 * hour);
  });

  it('checks shortly after the next rotation, whichever is earlier', () => {
    const rotationAt = now + 2 * hour;
    expect(nextRunAt({ now, intervalHours: 12, rotationAt })).toBe(rotationAt + 20 * 60_000);
    const lateRotation = now + 48 * hour;
    expect(nextRunAt({ now, intervalHours: 12, rotationAt: lateRotation })).toBe(now + 12 * hour);
  });

  it('backs off failures 1h doubling to a 4h cap and resets on success', () => {
    expect(nextRunAt({ now, intervalHours: 12, consecutiveFailures: 1 })).toBe(now + hour);
    expect(nextRunAt({ now, intervalHours: 12, consecutiveFailures: 2 })).toBe(now + 2 * hour);
    expect(nextRunAt({ now, intervalHours: 12, consecutiveFailures: 5 })).toBe(now + 4 * hour);
    expect(nextRunAt({ now, intervalHours: 12, consecutiveFailures: 0 })).toBe(now + 12 * hour);
  });
});

describe('derivePhase', () => {
  it('prefers the running operation, then session state, then the stored phase', () => {
    expect(derivePhase({ kind: 'login' }, { sessionOk: true, phase: 'claiming' })).toBe('login-waiting');
    expect(derivePhase(null, { sessionOk: false, phase: 'idle' })).toBe('need-login');
    expect(derivePhase(null, { sessionOk: true, phase: 'claiming' })).toBe('claiming');
    expect(derivePhase(null, { sessionOk: null, phase: 'idle' })).toBe('idle');
  });
});

describe('allowRequest', () => {
  const ok = { 'x-ega-plugin': '1', host: '127.0.0.1:49320' };

  it('requires the plugin header and a loopback host', () => {
    expect(allowRequest(ok)).toBe(true);
    expect(allowRequest({ host: '127.0.0.1:49320' })).toBe(false);
    expect(allowRequest({ 'x-ega-plugin': '1', host: 'example.com' })).toBe(false);
    expect(allowRequest({ 'x-ega-plugin': '1' })).toBe(false);
  });

  it('accepts localhost and ::1, rejects foreign origins (CSRF)', () => {
    expect(allowRequest({ ...ok, host: 'localhost:49320' })).toBe(true);
    expect(allowRequest({ ...ok, host: '[::1]:49320' })).toBe(true);
    expect(allowRequest({ ...ok, origin: 'http://evil.example' })).toBe(false);
    expect(allowRequest({ ...ok, origin: 'http://127.0.0.1:49320' })).toBe(true);
  });
});
