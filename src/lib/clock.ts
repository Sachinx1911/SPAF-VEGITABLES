import { toISODate, toISODateTime } from './format';
import { API_MODE } from './api';

/**
 * Demo clock. The prototype is anchored to a fixed operational morning so the
 * seeded data always reads as "today". Real elapsed time since seeding is added
 * (capped) so actions performed in the demo get sensible, increasing timestamps.
 *
 * Against a real backend this is simply `new Date()`. It has to be: the server
 * stamps rows with the actual date, and a screen still living in the seeded
 * morning would filter every one of them out of view.
 */
export const DEMO_NOW = new Date(2026, 8, 13, 10, 40, 0); // 13-09-2026 10:40
const MAX_DRIFT_MS = 6 * 3600 * 1000;

let seededAt = Date.now();

export function setSeededAt(ms: number) {
  seededAt = ms;
}

export function now(): Date {
  if (API_MODE) return new Date();

  const drift = Math.min(Math.max(Date.now() - seededAt, 0), MAX_DRIFT_MS);
  return new Date(DEMO_NOW.getTime() + drift);
}

export const nowISO = () => toISODateTime(now());
export const todayISO = () => toISODate(now());
