'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  onIdTokenChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from './firebase';
import type { AppUser, Role } from './types';

interface AuthContextValue {
  firebaseUser: User | null;
  appUser: AppUser | null;
  /** Peran yang sedang ditampilkan (untuk akun multi-role); null bila belum masuk. */
  activeRole: Role | null;
  setActiveRole: (role: Role) => void;
  loading: boolean;
  configured: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  /** Baca ulang users/{uid} — dipanggil setelah pengguna menyunting profilnya. */
  refreshAppUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ACTIVE_ROLE_KEY = (uid: string) => `silapa_active_role_${uid}`;

/** Peran aktif tersimpan (localStorage) bila valid untuk akun ini, else peran pertama. */
function resolveActiveRole(uid: string, roles: Role[]): Role | null {
  if (roles.length === 0) return null;
  try {
    const saved = window.localStorage.getItem(ACTIVE_ROLE_KEY(uid)) as Role | null;
    if (saved && roles.includes(saved)) return saved;
  } catch {
    // localStorage tidak tersedia (SSR/privat mode) — abaikan.
  }
  return roles[0];
}

/** Batas tunggu sinkron cookie sesi — lihat catatan di bawah. */
const SESSION_SYNC_TIMEOUT_MS = 4000;

/** Sinkron cookie httpOnly yang dibaca middleware.ts (PRD §3). Best-effort. */
async function syncSessionCookie(user: User | null) {
  try {
    if (user) {
      const idToken = await user.getIdToken();
      await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        signal: AbortSignal.timeout(SESSION_SYNC_TIMEOUT_MS),
      });
    } else {
      await fetch('/api/session', { method: 'DELETE', signal: AbortSignal.timeout(SESSION_SYNC_TIMEOUT_MS) });
    }
  } catch {
    // Middleware akan fallback ke client-side guard bila cookie tidak sinkron.
  }
}

/**
 * Tunggu sinkron cookie, TAPI jangan pernah lebih dari batas waktu.
 *
 * Menunggu itu perlu: halaman login mengalihkan ke dashboard begitu appUser
 * terisi, sedangkan middleware menolak rute /dosen|/admin|/wadek bila cookie
 * belum ada — tanpa menunggu, keduanya berlomba dan pengguna terlempar balik.
 *
 * Tapi menunggu TANPA BATAS membuat aplikasi menggantung total di jaringan
 * seluler yang buruk: `loading` tidak pernah selesai, layar berhenti di
 * "memproses". Karena itu dibatasi — bila lewat batas, aplikasi tetap jalan
 * dan penjaga sisi klien di (app)/layout.tsx yang mengamankan rutenya.
 */
async function syncSessionCookieBounded(user: User | null) {
  await Promise.race([
    syncSessionCookie(user),
    new Promise((resolve) => setTimeout(resolve, SESSION_SYNC_TIMEOUT_MS)),
  ]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [activeRole, setActiveRoleState] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  function setActiveRole(role: Role) {
    setActiveRoleState(role);
    if (appUser) {
      try {
        window.localStorage.setItem(ACTIVE_ROLE_KEY(appUser.uid), role);
      } catch {
        // localStorage tidak tersedia — peran aktif tidak persist antar sesi.
      }
    }
  }

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setLoading(false);
      return;
    }
    // onIdTokenChanged (bukan onAuthStateChanged) agar cookie sesi ikut
    // disegarkan tiap kali Firebase merotasi ID token (~tiap jam), sehingga
    // custom claim `role` yang baru dibuat langsung terbawa tanpa perlu
    // logout manual.
    const unsub = onIdTokenChanged(auth, async (user) => {
      setFirebaseUser(user);
      // Ditunggu (berbatas waktu) supaya cookie sudah ada sebelum halaman
      // login mengalihkan ke dashboard — lihat syncSessionCookieBounded.
      await syncSessionCookieBounded(user);
      if (user && db) {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          if (snap.exists()) {
            const data = snap.data() as Omit<AppUser, 'uid'>;
            setAppUser({ uid: user.uid, ...data });
            setActiveRoleState(resolveActiveRole(user.uid, data.roles ?? []));
          } else {
            setAppUser(null);
            setActiveRoleState(null);
          }
        } catch {
          setAppUser(null);
          setActiveRoleState(null);
        }
      } else {
        setAppUser(null);
        setActiveRoleState(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  async function login(email: string, password: string) {
    if (!auth) throw new Error('Firebase belum dikonfigurasi.');
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function refreshAppUser() {
    const uid = auth?.currentUser?.uid;
    if (!uid || !db) return;
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) setAppUser({ uid, ...(snap.data() as Omit<AppUser, 'uid'>) });
  }

  async function logout() {
    if (auth) await signOut(auth);
    await syncSessionCookie(null);
    setAppUser(null);
    setFirebaseUser(null);
    setActiveRoleState(null);
  }

  async function resetPassword(email: string) {
    if (!auth) throw new Error('Firebase belum dikonfigurasi.');
    // continueUrl mengarah ke halaman reset custom kita (bukan halaman
    // bawaan Firebase) — efektif penuh hanya jika "Customize action URL"
    // di Firebase Console > Authentication > Templates > Password reset
    // juga diarahkan ke /reset-password (langkah manual, lihat catatan tim).
    await sendPasswordResetEmail(auth, email, {
      url: `${window.location.origin}/reset-password`,
      handleCodeInApp: false,
    });
  }

  return (
    <AuthContext.Provider
      value={{ firebaseUser, appUser, activeRole, setActiveRole, loading, configured: isFirebaseConfigured, login, logout, resetPassword, refreshAppUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Landing route for a given role. */
export function homeRouteForRole(role: Role): string {
  switch (role) {
    case 'dosen_pa':
      return '/dosen';
    case 'admin':
      return '/admin/mahasiswa';
    case 'wadek1':
      return '/wadek';
    default:
      return '/login';
  }
}
