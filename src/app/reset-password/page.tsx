'use client';

import { useEffect, useState } from 'react';
import { Suspense } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { auth, isFirebaseConfigured } from '@/lib/firebase';
import { colors } from '@/lib/theme';

type Status = 'checking' | 'ready' | 'invalid' | 'noCode' | 'success';

function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const oobCode = params.get('oobCode') ?? '';
  const mode = params.get('mode') ?? '';

  const [status, setStatus] = useState<Status>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Tidak ada kode sama sekali — biasanya karena halaman ini dibuka
    // langsung (bukan dari tautan reset), ATAU pengguna baru saja
    // menyelesaikan ganti kata sandi di halaman bawaan Firebase lalu
    // diarahkan kembali ke sini lewat continueUrl (tanpa kode, karena
    // kodenya sudah dipakai di sana). Bedakan dari kode yang benar-benar
    // tidak valid/kedaluwarsa agar pesannya tidak menakut-nakuti.
    if (mode !== 'resetPassword' || !oobCode) {
      setStatus('noCode');
      return;
    }
    if (!isFirebaseConfigured || !auth) {
      setStatus('invalid');
      return;
    }
    verifyPasswordResetCode(auth, oobCode)
      .then((resolvedEmail) => {
        setEmail(resolvedEmail);
        setStatus('ready');
      })
      .catch(() => setStatus('invalid'));
  }, [mode, oobCode]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    if (password.length < 6) {
      setErr('Kata sandi minimal 6 karakter.');
      return;
    }
    if (password !== confirm) {
      setErr('Konfirmasi kata sandi tidak cocok.');
      return;
    }
    if (!auth) return;
    setBusy(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setStatus('success');
    } catch (e: any) {
      const code = e?.code ?? '';
      if (code === 'auth/expired-action-code' || code === 'auth/invalid-action-code') {
        setStatus('invalid');
      } else if (code === 'auth/weak-password') {
        setErr('Kata sandi terlalu lemah, gunakan minimal 6 karakter.');
      } else {
        setErr('Gagal menyimpan kata sandi baru. Coba lagi.');
      }
    } finally {
      setBusy(false);
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
        background: 'radial-gradient(circle at 20% 15%,#0E7F45 0%,#073B21 55%,#052818 100%)',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          background: colors.surface,
          borderRadius: 22,
          overflow: 'hidden',
          padding: '48px 40px',
          boxShadow: '0 30px 70px rgba(4,30,16,0.45)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <Image src="/logo-uis.png" alt="Logo Universitas Ibnu Sina" width={56} height={56} style={{ objectFit: 'contain' }} />
        </div>

        {status === 'checking' && (
          <span style={{ display: 'block', textAlign: 'center', fontSize: 13.5, color: colors.muted }}>
            Memeriksa tautan reset kata sandi…
          </span>
        )}

        {status === 'invalid' && (
          <>
            <span style={{ fontSize: 18, fontWeight: 800, color: colors.ink, display: 'block', textAlign: 'center', marginBottom: 8 }}>
              Tautan tidak valid
            </span>
            <span style={{ fontSize: 13, color: colors.muted, display: 'block', textAlign: 'center', marginBottom: 24, lineHeight: 1.6 }}>
              Tautan reset kata sandi sudah kedaluwarsa atau sudah pernah dipakai. Minta tautan baru dari halaman login.
            </span>
            <button
              onClick={() => router.push('/login')}
              style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: colors.green, color: colors.white, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              Ke Halaman Login
            </button>
          </>
        )}

        {status === 'noCode' && (
          <>
            <span style={{ fontSize: 18, fontWeight: 800, color: colors.ink, display: 'block', textAlign: 'center', marginBottom: 8 }}>
              Selesai
            </span>
            <span style={{ fontSize: 13, color: colors.muted, display: 'block', textAlign: 'center', marginBottom: 24, lineHeight: 1.6 }}>
              Bila Anda baru saja mengganti kata sandi lewat tautan email, prosesnya sudah selesai — silakan masuk dengan kata sandi baru Anda.
              Bila belum, minta tautan reset baru dari halaman login.
            </span>
            <button
              onClick={() => router.push('/login')}
              style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: colors.green, color: colors.white, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              Ke Halaman Login
            </button>
          </>
        )}

        {status === 'success' && (
          <>
            <span style={{ fontSize: 18, fontWeight: 800, color: colors.ink, display: 'block', textAlign: 'center', marginBottom: 8 }}>
              Kata sandi berhasil diubah
            </span>
            <span style={{ fontSize: 13, color: colors.muted, display: 'block', textAlign: 'center', marginBottom: 24, lineHeight: 1.6 }}>
              Silakan masuk dengan kata sandi baru Anda.
            </span>
            <button
              onClick={() => router.push('/login')}
              style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: colors.green, color: colors.white, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              Ke Halaman Login
            </button>
          </>
        )}

        {status === 'ready' && (
          <form onSubmit={submit}>
            <span style={{ fontSize: 18, fontWeight: 800, color: colors.ink, display: 'block', textAlign: 'center', marginBottom: 4 }}>
              Buat kata sandi baru
            </span>
            <span style={{ fontSize: 13, color: colors.muted, display: 'block', textAlign: 'center', marginBottom: 24 }}>
              untuk {email}
            </span>

            <label style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 6, display: 'block' }}>Kata sandi baru</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="min. 6 karakter"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1px solid ${colors.border}`, fontSize: 14, marginBottom: 16, outline: 'none' }}
            />
            <label style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 6, display: 'block' }}>Konfirmasi kata sandi</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="ulangi kata sandi"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1px solid ${colors.border}`, fontSize: 14, marginBottom: err ? 10 : 22, outline: 'none' }}
            />
            {err && <span style={{ display: 'block', fontSize: 12.5, color: colors.danger, marginBottom: 14, fontWeight: 600 }}>{err}</span>}
            <button
              type="submit"
              disabled={busy}
              style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: colors.green, color: colors.white, fontSize: 14, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}
            >
              {busy ? 'Menyimpan…' : 'Simpan Kata Sandi'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
