import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { Database, User } from '../types/models';
import { generateSeed, SEED_VERSION } from '../data/seed/generate';
import { DEMO_PASSWORD } from '../data/seed/roles';
import { nowISO, setSeededAt } from '../lib/clock';
import { API_MODE, setUnauthenticatedHandler } from '../lib/api';
import { apiLogin, apiLogout, apiRestoreSession, type ApiSession } from './authApi';
import { setServerPermissions } from '../lib/nav';
import type { ModuleKey, PermissionAction } from '../types/models';

const DB_KEY = 'spaf-os.db';
const UI_KEY = 'spaf-os.ui';

/** localStorage that never throws (private mode, quota, blocked storage). */
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch (e) {
      console.warn('SPAF: could not persist demo state', e);
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

function initialDb(): Database {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.version === SEED_VERSION && parsed.state?.db?.meta) return parsed.state.db as Database;
    }
  } catch {
    /* fall through to a fresh seed */
  }
  return generateSeed();
}

export interface Session {
  userId: string;
  loginAt: string;
  remember: boolean;
}

export type LoginResult = { ok: true; user: User } | { ok: false; error: string };

interface DataState {
  db: Database;
  session: Session | null;
  sessionExpired: boolean;
  /**
   * In API mode the signed-in user and their grants come from the server rather
   * than from the seeded tables, so they are held separately.
   */
  apiUser: User | null;
  apiPermissions: Partial<Record<ModuleKey, PermissionAction[]>> | null;
  /** True while a stored token is being checked on first load. */
  restoring: boolean;
  login: (identifier: string, password: string, remember: boolean) => LoginResult;
  loginViaApi: (identifier: string, password: string, remember: boolean) => Promise<{ ok: boolean; error?: string }>;
  restoreApiSession: () => Promise<void>;
  loginAs: (userId: string) => User | null;
  logout: () => void;
  expireSession: () => void;
  resetDemo: () => void;
  /** Apply a change to the database; the recipe returns only the tables it replaced. */
  commit: (recipe: (db: Database) => Partial<Database>) => void;
}

const firstDb = initialDb();
setSeededAt(firstDb.meta.seededAt);

export const useStore = create<DataState>()(
  persist(
    (set, get) => ({
      db: firstDb,
      session: null,
      sessionExpired: false,
      apiUser: null,
      apiPermissions: null,
      restoring: API_MODE,

      login: (identifier, password, remember) => {
        const id = identifier.trim().toLowerCase();
        const digits = id.replace(/\D/g, '');
        const user = get().db.users.find(
          (u) => u.email.toLowerCase() === id || (digits.length >= 10 && u.mobile.replace(/\D/g, '').endsWith(digits.slice(-10))),
        );
        if (!user || password !== DEMO_PASSWORD) return { ok: false, error: 'Email/mobile or password is incorrect.' };
        if (user.status !== 'Active') return { ok: false, error: 'This account is inactive. Contact your administrator.' };
        get().commit((db) => ({ users: db.users.map((u) => (u.id === user.id ? { ...u, lastLogin: nowISO() } : u)) }));
        set({ session: { userId: user.id, loginAt: nowISO(), remember }, sessionExpired: false });
        return { ok: true, user };
      },

      loginAs: (userId) => {
        const user = get().db.users.find((u) => u.id === userId) ?? null;
        if (user) set({ session: { userId, loginAt: nowISO(), remember: true }, sessionExpired: false });
        return user;
      },

      /** Signs in against the server. Only used when VITE_API_URL is set. */
      loginViaApi: async (identifier, password, remember) => {
        const res = await apiLogin(identifier, password, remember);
        if (!res.ok) return { ok: false, error: res.error };

        setServerPermissions(res.session.permissions);
        set({
          apiUser: res.session.user,
          apiPermissions: res.session.permissions,
          session: { userId: res.session.user.id, loginAt: nowISO(), remember },
          sessionExpired: false,
          restoring: false,
        });
        return { ok: true };
      },

      /** Checks a stored token on first load so a refresh does not sign the user out. */
      restoreApiSession: async () => {
        if (!API_MODE) {
          set({ restoring: false });
          return;
        }
        const session: ApiSession | null = await apiRestoreSession();
        setServerPermissions(session?.permissions ?? null);
        set(
          session
            ? {
                apiUser: session.user,
                apiPermissions: session.permissions,
                session: { userId: session.user.id, loginAt: nowISO(), remember: true },
                restoring: false,
              }
            : { apiUser: null, apiPermissions: null, session: null, restoring: false },
        );
      },

      logout: () => {
        if (API_MODE) void apiLogout();
        setServerPermissions(null);
        set({ session: null, sessionExpired: false, apiUser: null, apiPermissions: null });
      },
      expireSession: () => {
        if (API_MODE) void apiLogout();
        setServerPermissions(null);
        set({ session: null, sessionExpired: true, apiUser: null, apiPermissions: null });
      },

      resetDemo: () => {
        const db = generateSeed();
        setSeededAt(db.meta.seededAt);
        set({ db });
      },

      commit: (recipe) => set((s) => ({ db: { ...s.db, ...recipe(s.db) } })),
    }),
    {
      name: DB_KEY,
      version: SEED_VERSION,
      storage: createJSONStorage(() => safeStorage),
      // The API session is never persisted: the token decides whether it is
      // still valid, and a stale copy here would show a signed-in shell to
      // somebody the server has already logged out.
      partialize: (s) => (API_MODE ? { db: s.db } : { db: s.db, session: s.session }),
      migrate: () => ({ db: generateSeed(), session: null }) as never,
    },
  ),
);

interface UiState {
  sidebarCollapsed: boolean;
  readNotificationIds: string[];
  setSidebarCollapsed: (v: boolean) => void;
  markRead: (ids: string[]) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      readNotificationIds: [],
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      markRead: (ids) => set((s) => ({ readNotificationIds: [...new Set([...s.readNotificationIds, ...ids])] })),
    }),
    { name: UI_KEY, storage: createJSONStorage(() => safeStorage) },
  ),
);

export function useDb() {
  return useStore((s) => s.db);
}

export function useCurrentUser(): User | null {
  return useStore((s) => {
    if (API_MODE) return s.apiUser;
    return s.session ? (s.db.users.find((u) => u.id === s.session!.userId) ?? null) : null;
  });
}

/** A 401 from any call ends the session, so the shell stops showing stale data. */
setUnauthenticatedHandler(() => {
  const { session, expireSession } = useStore.getState();
  if (session) expireSession();
});
