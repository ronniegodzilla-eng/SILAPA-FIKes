'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth, homeRouteForRole } from '@/lib/auth-context';
import { useData } from '@/lib/data-context';
import { useViewportWidth } from '@/lib/use-viewport';
import { NAV_CONFIG, ROLE_LABELS, PAGE_TITLES, isNavActive } from '@/lib/nav';
import { colors } from '@/lib/theme';
import { Icon } from './ui';
import type { Role } from '@/lib/types';

/** Lets dynamic pages (form/riwayat) override the header title/subtitle. */
const HeaderContext = createContext<{
  setHeader: (t: { title: string; subtitle: string } | null) => void;
}>({ setHeader: () => {} });

export function useSetHeader(title: string, subtitle: string) {
  const { setHeader } = useContext(HeaderContext);
  useEffect(() => {
    setHeader({ title, subtitle });
    return () => setHeader(null);
  }, [title, subtitle, setHeader]);
}

const LOGOUT_ICON =
  'M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4 M16 8l4 4-4 4 M20 12H9';

export function AppShell({ children }: { children: ReactNode }) {
  const { appUser, activeRole, setActiveRole, logout } = useAuth();
  const { periode } = useData();
  const pathname = usePathname();
  const router = useRouter();
  const width = useViewportWidth();
  const isNarrow = width < 880;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [override, setOverride] = useState<{ title: string; subtitle: string } | null>(null);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const role = activeRole;
  const navItems = role ? NAV_CONFIG[role] : [];

  function switchRole(next: Role) {
    setActiveRole(next);
    router.replace(homeRouteForRole(next));
  }
  const [defTitle, defSub] = PAGE_TITLES[pathname] ?? ['SILAPA-FIKes', ''];
  const title = override?.title ?? defTitle;
  const subtitle = override?.subtitle ?? defSub;

  const initials = useMemo(
    () =>
      appUser
        ? appUser.nama
            .split(' ')
            .map((w) => w[0])
            .slice(0, 2)
            .join('')
            .toUpperCase()
        : '',
    [appUser]
  );

  async function doLogout() {
    await logout();
    router.replace('/login');
  }

  const sidebarStyle: React.CSSProperties = isNarrow
    ? {
        width: 264, minWidth: 264,
        background: 'linear-gradient(180deg,#0B6E3C 0%,#073B21 100%)',
        display: 'flex', flexDirection: 'column', padding: '24px 16px',
        position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 30,
        transform: `translateX(${mobileNavOpen ? '0' : '-100%'})`,
        transition: 'transform .25s ease',
      }
    : {
        width: 264, minWidth: 264,
        background: 'linear-gradient(180deg,#0B6E3C 0%,#073B21 100%)',
        display: 'flex', flexDirection: 'column', padding: '24px 16px',
        position: 'sticky', top: 0, height: '100vh',
      };

  return (
    <HeaderContext.Provider value={{ setHeader: setOverride }}>
      <div style={{ display: 'flex', minHeight: '100vh', width: '100%', background: colors.appBg, position: 'relative' }}>
        {isNarrow && mobileNavOpen && (
          <div
            onClick={() => setMobileNavOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(7,20,12,0.5)', zIndex: 29 }}
          />
        )}

        {/* SIDEBAR */}
        <aside style={sidebarStyle}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '4px 8px 20px 8px',
              borderBottom: '1px solid rgba(255,255,255,0.14)', marginBottom: 16,
            }}
          >
            <Image src="/logo-uis.png" alt="Logo UIS" width={44} height={44} style={{ objectFit: 'contain', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
              <span style={{ fontFamily: "'Lora',serif", fontWeight: 700, fontSize: 17, color: colors.white, letterSpacing: 0.2 }}>
                SILAPA<span style={{ color: colors.yellow }}>-FIKes</span>
              </span>
              <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.65)', fontWeight: 500, letterSpacing: 0.3 }}>
                Univ. Ibnu Sina
              </span>
            </div>
          </div>

          <div style={{ padding: '0 8px 16px 8px' }}>
            {appUser && appUser.roles.length > 1 ? (
              <select
                value={role ?? ''}
                onChange={(e) => switchRole(e.target.value as Role)}
                style={{
                  width: '100%', fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
                  color: colors.white, background: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.25)', borderRadius: 7,
                  padding: '6px 8px', textTransform: 'uppercase', cursor: 'pointer',
                }}
                title="Akun ini punya lebih dari satu peran — pilih tampilan aktif"
              >
                {appUser.roles.map((r) => (
                  <option key={r} value={r} style={{ color: '#111' }}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            ) : (
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' }}>
                {role ? ROLE_LABELS[role] : ''}
              </span>
            )}
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
            {navItems.map((item) => {
              const active = isNavActive(item, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11,
                    padding: '11px 12px', borderRadius: 10, cursor: 'pointer',
                    textDecoration: 'none',
                    color: active ? '#073B21' : 'rgba(255,255,255,0.8)',
                    background: active ? colors.yellow : 'transparent',
                  }}
                >
                  <Icon path={item.icon} size={18} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.14)', paddingTop: 14, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px' }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: colors.yellow, color: '#073B21', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                {initials}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: colors.white, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {appUser?.nama}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {appUser?.email}
                </span>
              </div>
            </div>
            <div
              onClick={doLogout}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', borderRadius: 9, color: 'rgba(255,255,255,0.75)', cursor: 'pointer', fontSize: 13.5, fontWeight: 600 }}
            >
              <Icon path={LOGOUT_ICON} size={17} />
              Keluar
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <header
            style={{
              height: 72, minHeight: 72, background: colors.surface,
              borderBottom: `1px solid ${colors.border}`, display: 'flex',
              alignItems: 'center', justifyContent: 'space-between',
              padding: '0 20px', position: 'sticky', top: 0, zIndex: 5, gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              {isNarrow && (
                <div
                  onClick={() => setMobileNavOpen((v) => !v)}
                  style={{ width: 38, height: 38, minWidth: 38, borderRadius: 9, border: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  <Icon path="M4 7h16 M4 12h16 M4 17h16" size={18} stroke={colors.ink} />
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontSize: 16.5, fontWeight: 700, color: colors.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {title}
                </span>
                <span style={{ fontSize: 12.5, color: colors.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {subtitle}
                </span>
              </div>
            </div>
            {width > 560 && periode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: colors.appBg, border: `1px solid ${colors.border}`, borderRadius: 999, padding: '7px 14px', whiteSpace: 'nowrap' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: colors.green, flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: colors.ink }}>
                    Periode {periode.tahunAkademik} · {periode.semester === 'genap' ? 'Genap' : 'Ganjil'}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: colors.green, background: colors.greenSoftBg, padding: '2px 8px', borderRadius: 999, textTransform: 'capitalize' }}>
                    {periode.status}
                  </span>
                </div>
              </div>
            )}
          </header>

          <main style={{ flex: 1, padding: '28px 32px 48px 32px', overflowY: 'auto' }}>{children}</main>
        </div>
      </div>
    </HeaderContext.Provider>
  );
}
