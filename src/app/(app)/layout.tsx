'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth, homeRouteForRole } from '@/lib/auth-context';
import { DataProvider } from '@/lib/data-context';
import { AppShell } from '@/components/AppShell';
import type { Role } from '@/lib/types';

function Spinner() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          width: 26, height: 26, border: '3px solid #C7D2C1',
          borderTopColor: '#0B6E3C', borderRadius: '50%',
          animation: 'silapaSpin .8s linear infinite',
        }}
      />
    </div>
  );
}

/** Prefix → role allowed to view it. */
function requiredRole(pathname: string): Role | null {
  if (pathname.startsWith('/dosen')) return 'dosen_pa';
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/wadek')) return 'wadek1';
  return null;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { appUser, activeRole, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!appUser) {
      router.replace('/login');
      return;
    }
    const needed = requiredRole(pathname);
    // Akun multi-role: rute diizinkan bila SALAH SATU peran cocok, bukan
    // hanya peran yang sedang aktif ditampilkan.
    if (needed && !appUser.roles.includes(needed)) {
      router.replace(homeRouteForRole(activeRole ?? appUser.roles[0]));
    }
  }, [appUser, activeRole, loading, pathname, router]);

  if (loading || !appUser) return <Spinner />;
  const needed = requiredRole(pathname);
  if (needed && !appUser.roles.includes(needed)) return <Spinner />;

  return (
    <DataProvider>
      <AppShell>{children}</AppShell>
    </DataProvider>
  );
}
