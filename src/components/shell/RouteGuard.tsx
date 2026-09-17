import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useCurrentUser, useStore } from '../../store/useStore';
import { useIdleTimeout } from './useIdleTimeout';
import { can } from '../../lib/nav';
import type { ModuleKey, PermissionAction } from '../../types/models';
import { PermissionDeniedPage } from '../../pages/states/StatePages';

export function RequireAuth({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const expired = useStore((s) => s.sessionExpired);
  const location = useLocation();
  useIdleTimeout();

  // An idle timeout and a plain sign-out both leave no user, but they need
  // different screens: one explains itself, the other just asks for a login.
  if (!user) {
    return expired
      ? <Navigate to="/session-expired" replace />
      : <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

/** Gate a route by role permission; renders the shared Permission Denied state instead of the page. */
export function RequireModule({ module, action = 'view', children }: { module: ModuleKey; action?: PermissionAction; children: ReactNode }) {
  const user = useCurrentUser();
  const db = useStore((s) => s.db);
  if (!user) return <Navigate to="/login" replace />;
  if (!can(db, user.role, module, action)) return <PermissionDeniedPage />;
  return <>{children}</>;
}

/**
 * Prototype-only screens (role switcher, design system). These hand out any
 * identity without a password, so they must never ship: they are compiled out
 * of a production build, and even in dev only an admin may open them.
 */
export function RequireDemoTools({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  if (!user) return <Navigate to="/login" replace />;
  if (!import.meta.env.DEV || user.role !== 'admin') return <PermissionDeniedPage />;
  return <>{children}</>;
}
