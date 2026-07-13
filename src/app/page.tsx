'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, homeRouteForRole } from '@/lib/auth-context';

export default function RootPage() {
  const router = useRouter();
  const { appUser, activeRole, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    router.replace(appUser ? homeRouteForRole(activeRole ?? appUser.roles[0]) : '/login');
  }, [appUser, activeRole, loading, router]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          width: 26,
          height: 26,
          border: '3px solid #C7D2C1',
          borderTopColor: '#0B6E3C',
          borderRadius: '50%',
          animation: 'silapaSpin .8s linear infinite',
        }}
      />
    </div>
  );
}
