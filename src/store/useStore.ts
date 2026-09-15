import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { Database, User } from '../types/models';
import { generateSeed, SEED_VERSION } from '../data/seed/generate';
import { DEMO_PASSWORD } from '../data/seed/roles';
import { nowISO, setSeededAt } from '../lib/clock';

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
  login: (identifier: string, password: string, remember: boolean) => LoginResult;
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

      logout: () => set({ session: null, sessionExpired: false }),
      expireSession: () => set({ session: null, sessionExpired: true }),

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
      partialize: (s) => ({ db: s.db, session: s.session }),
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
  return useStore((s) => (s.session ? (s.db.users.find((u) => u.id === s.session!.userId) ?? null) : null));
}
