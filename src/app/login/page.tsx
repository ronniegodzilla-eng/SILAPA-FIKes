'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth, homeRouteForRole } from '@/lib/auth-context';
import { useViewportWidth } from '@/lib/use-viewport';
import { colors } from '@/lib/theme';

export default function LoginPage() {
  const router = useRouter();
  const { appUser, activeRole, loading, configured, login, resetPassword } = useAuth();
  const width = useViewportWidth();
  const isNarrow = width < 880;

  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [resetEmail, setResetEmail] = useState('');
  const [resetErr, setResetErr] = useState<string | null>(null);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    if (!loading && appUser) router.replace(homeRouteForRole(activeRole ?? appUser.roles[0]));
  }, [appUser, activeRole, loading, router]);

  async function doLogin(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login(email, password);
    } catch (e: any) {
      setErr('Email atau kata sandi salah, atau akun belum terdaftar.');
    } finally {
      setBusy(false);
    }
  }

  function openForgot() {
    setResetEmail(email);
    setResetErr(null);
    setResetMsg(null);
    setMode('forgot');
  }

  async function doResetPassword(e?: React.FormEvent) {
    e?.preventDefault();
    setResetErr(null);
    setResetMsg(null);
    const target = resetEmail.trim();
    if (!target) {
      setResetErr('Isi email terlebih dahulu.');
      return;
    }
    setResetBusy(true);
    try {
      await resetPassword(target);
      setResetMsg('Jika email tersebut terdaftar, tautan reset kata sandi sudah dikirim. Periksa kotak masuk (dan folder spam).');
    } catch (e: any) {
      const code = e?.code ?? '';
      if (code === 'auth/invalid-email') {
        setResetErr('Format email tidak valid.');
      } else if (code === 'auth/too-many-requests') {
        setResetErr('Terlalu banyak percobaan. Coba lagi beberapa saat lagi.');
      } else {
        // Jangan bocorkan apakah email terdaftar atau tidak (auth/user-not-found dsb).
        setResetMsg('Jika email tersebut terdaftar, tautan reset kata sandi sudah dikirim. Periksa kotak masuk (dan folder spam).');
      }
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(circle at 20% 15%,#0E7F45 0%,#073B21 55%,#052818 100%)',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 940,
          background: colors.surface,
          borderRadius: 22,
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: isNarrow ? '1fr' : '1fr 1fr',
          boxShadow: '0 30px 70px rgba(4,30,16,0.45)',
        }}
      >
        {/* Brand panel */}
        <div
          style={{
            background: 'linear-gradient(160deg,#0B6E3C,#073B21)',
            padding: '48px 40px',
            display: isNarrow ? 'none' : 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            color: colors.white,
          }}
        >
          <div>
            <Image
              src="/logo-uis.png"
              alt="Logo Universitas Ibnu Sina"
              width={76}
              height={76}
              style={{ objectFit: 'contain', marginBottom: 24 }}
            />
            <div style={{ fontFamily: "'Lora',serif", fontSize: 26, fontWeight: 700, lineHeight: 1.25 }}>
              SILAPA<span style={{ color: colors.yellow }}>-FIKes</span>
            </div>
            <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.75)', marginTop: 10, lineHeight: 1.6 }}>
              Sistem Informasi Pelaporan Pembimbing Akademik — Fakultas Ilmu Kesehatan, Universitas Ibnu Sina.
            </div>
          </div>
        </div>

        {/* Form panel */}
        {mode === 'login' ? (
          <form onSubmit={doLogin} style={{ padding: '48px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: colors.ink }}>Masuk ke akun Anda</span>
            <span style={{ fontSize: 13, color: colors.muted, marginTop: 4, marginBottom: 24 }}>
              Gunakan email institusi yang terdaftar oleh admin fakultas.
            </span>

            {!configured && (
              <div
                style={{
                  fontSize: 12.5,
                  color: colors.amberText,
                  background: colors.amberBg,
                  border: `1px solid ${colors.warnBannerBorder}`,
                  borderRadius: 10,
                  padding: '10px 12px',
                  marginBottom: 16,
                  lineHeight: 1.5,
                }}
              >
                Firebase belum dikonfigurasi. Salin <code>.env.local.example</code> ke <code>.env.local</code>,
                isi kredensial proyek, lalu jalankan <code>npm run seed</code>.
              </div>
            )}

            <label style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 6 }}>Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@uis.ac.id"
              style={{ padding: '12px 14px', borderRadius: 10, border: `1px solid ${colors.border}`, fontSize: 14, marginBottom: 16, outline: 'none' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink }}>Kata sandi</label>
              <span
                onClick={openForgot}
                style={{ fontSize: 12, fontWeight: 700, color: colors.green, cursor: 'pointer' }}
              >
                Lupa password?
              </span>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ padding: '12px 14px', borderRadius: 10, border: `1px solid ${colors.border}`, fontSize: 14, marginBottom: err ? 10 : 22, outline: 'none' }}
            />
            {err && <span style={{ fontSize: 12.5, color: colors.danger, marginBottom: 14, fontWeight: 600 }}>{err}</span>}
            <button
              type="submit"
              disabled={busy}
              style={{ padding: 13, borderRadius: 10, border: 'none', background: colors.green, color: colors.white, fontSize: 14, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', marginBottom: 22 }}
            >
              {busy ? 'Memproses…' : 'Masuk'}
            </button>
          </form>
        ) : (
          <form onSubmit={doResetPassword} style={{ padding: '48px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: colors.ink }}>Reset kata sandi</span>
            <span style={{ fontSize: 13, color: colors.muted, marginTop: 4, marginBottom: 24, lineHeight: 1.5 }}>
              Masukkan email institusi Anda. Bila terdaftar, kami kirim tautan untuk membuat kata sandi baru.
            </span>

            <label style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 6 }}>Email</label>
            <input
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="nama@uis.ac.id"
              style={{ padding: '12px 14px', borderRadius: 10, border: `1px solid ${colors.border}`, fontSize: 14, marginBottom: resetErr || resetMsg ? 10 : 22, outline: 'none' }}
            />
            {resetErr && <span style={{ fontSize: 12.5, color: colors.danger, marginBottom: 14, fontWeight: 600 }}>{resetErr}</span>}
            {resetMsg && <span style={{ fontSize: 12.5, color: colors.green, marginBottom: 14, fontWeight: 600, lineHeight: 1.5 }}>{resetMsg}</span>}

            <button
              type="submit"
              disabled={resetBusy}
              style={{ padding: 13, borderRadius: 10, border: 'none', background: colors.green, color: colors.white, fontSize: 14, fontWeight: 700, cursor: resetBusy ? 'wait' : 'pointer', marginBottom: 14 }}
            >
              {resetBusy ? 'Mengirim…' : 'Kirim Tautan Reset'}
            </button>
            <span
              onClick={() => setMode('login')}
              style={{ fontSize: 13, fontWeight: 700, color: colors.ink, cursor: 'pointer', textAlign: 'center' }}
            >
              ← Kembali ke login
            </span>
          </form>
        )}
      </div>
    </div>
  );
}
