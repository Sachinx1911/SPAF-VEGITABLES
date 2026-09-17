import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../useStore';
import { generateSeed } from '../../data/seed/generate';

/**
 * Signing out and timing out both end with no user, but the app has to tell
 * them apart: one shows the login form, the other explains why it happened.
 */
describe('session lifecycle', () => {
  beforeEach(() => {
    useStore.setState({ db: generateSeed(), session: null, sessionExpired: false });
  });

  it('starts a session on a correct login', () => {
    const res = useStore.getState().login('rajesh.patil@svproagro.in', 'spaf@123', false);
    expect(res.ok).toBe(true);
    expect(useStore.getState().session?.userId).toBe('u_admin');
    expect(useStore.getState().sessionExpired).toBe(false);
  });

  it('refuses a wrong password without starting a session', () => {
    const res = useStore.getState().login('rajesh.patil@svproagro.in', 'wrong', false);
    expect(res.ok).toBe(false);
    expect(useStore.getState().session).toBeNull();
  });

  it('refuses an unknown account', () => {
    expect(useStore.getState().login('nobody@example.com', 'spaf@123', false).ok).toBe(false);
  });

  it('accepts a mobile number as the identifier', () => {
    expect(useStore.getState().login('98200 11021', 'spaf@123', false).ok).toBe(true);
  });

  it('signing out leaves no expiry flag, so the plain login screen shows', () => {
    useStore.getState().login('rajesh.patil@svproagro.in', 'spaf@123', false);
    useStore.getState().logout();
    expect(useStore.getState().session).toBeNull();
    expect(useStore.getState().sessionExpired).toBe(false);
  });

  it('timing out clears the session and raises the expiry flag', () => {
    useStore.getState().login('rajesh.patil@svproagro.in', 'spaf@123', false);
    useStore.getState().expireSession();
    expect(useStore.getState().session).toBeNull();
    expect(useStore.getState().sessionExpired).toBe(true);
  });

  it('clears the expiry flag on the next successful login', () => {
    useStore.getState().expireSession();
    useStore.getState().login('rajesh.patil@svproagro.in', 'spaf@123', false);
    expect(useStore.getState().sessionExpired).toBe(false);
  });

  it('ships a non-zero idle timeout by default', () => {
    expect(useStore.getState().db.settings.sessionTimeoutMinutes).toBeGreaterThan(0);
  });
});
