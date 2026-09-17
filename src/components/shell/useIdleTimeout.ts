import { useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';

/** Activity that counts as "someone is still here". */
const EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'pointermove'] as const;

/**
 * Ends the session after a stretch of inactivity.
 *
 * The packing floor and delivery desk share terminals, so a signed-in screen
 * left alone is an open door to every customer's prices and dues. The timeout
 * length comes from Settings; 0 turns it off.
 *
 * Activity is recorded into a ref rather than state — a mousemove must not
 * re-render the whole app, and the check runs on a slow interval instead.
 */
export function useIdleTimeout() {
  const session = useStore((s) => s.session);
  const timeoutMinutes = useStore((s) => s.db.settings.sessionTimeoutMinutes ?? 30);
  const expireSession = useStore((s) => s.expireSession);
  const lastActive = useRef(Date.now());

  useEffect(() => {
    if (!session || timeoutMinutes <= 0) return;

    const touch = () => { lastActive.current = Date.now(); };
    // Passive: these listeners must never delay scrolling.
    EVENTS.forEach((e) => window.addEventListener(e, touch, { passive: true }));

    // A tab that was asleep can come back long past the limit, so re-check on wake.
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);

    const limit = timeoutMinutes * 60_000;
    const check = () => {
      if (Date.now() - lastActive.current >= limit) expireSession();
    };
    const timer = window.setInterval(check, 15_000);

    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, touch));
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [session, timeoutMinutes, expireSession]);
}
