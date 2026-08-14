'use client';

import { useRef, useState } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential, updateEmail, updatePassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/download';
import { colors } from '@/lib/theme';
import { Card, Icon, inputStyle, labelStyle } from '@/components/ui';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 3 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function initials(nama: string): string {
  return nama.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/** Pesan Firebase Auth → bahasa yang bisa dimengerti pengguna. */
function authErrorMessage(e: any, fallback: string): string {
  const code = e?.code ?? '';
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') return 'Kata sandi saat ini salah.';
  if (code === 'auth/too-many-requests') return 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.';
  if (code === 'auth/weak-password') return 'Kata sandi baru terlalu lemah (minimal 6 karakter).';
  if (code === 'auth/email-already-in-use') return 'Email tersebut sudah dipakai akun lain.';
  if (code === 'auth/invalid-email') return 'Format email tidak valid.';
  if (code === 'auth/requires-recent-login') return 'Sesi terlalu lama — masuk ulang lalu coba lagi.';
  if (code === 'auth/operation-not-allowed') {
    return 'Firebase menolak penggantian email langsung. Aktifkan di Firebase Console, atau minta admin mengubahnya lewat Kelola Pengguna.';
  }
  return e?.message || fallback;
}

export default function ProfilPage() {
  const { appUser, refreshAppUser } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [nama, setNama] = useState(appUser?.nama ?? '');
  const [email, setEmail] = useState(appUser?.email ?? '');
  const [prodi, setProdi] = useState<string>(appUser?.prodiHomebase ?? '');
  const [sandiSaatIni, setSandiSaatIni] = useState('');

  const [fotoBusy, setFotoBusy] = useState(false);
  const [profilBusy, setProfilBusy] = useState(false);
  const [profilErr, setProfilErr] = useState('');
  const [profilOk, setProfilOk] = useState('');

  const [sandiLama, setSandiLama] = useState('');
  const [sandiBaru, setSandiBaru] = useState('');
  const [sandiUlang, setSandiUlang] = useState('');
  const [sandiBusy, setSandiBusy] = useState(false);
  const [sandiErr, setSandiErr] = useState('');
  const [sandiOk, setSandiOk] = useState('');

  if (!appUser) {
    return <span style={{ fontSize: 13, color: colors.muted }}>Memuat profil…</span>;
  }

  const isDosen = appUser.roles.includes('dosen_pa');
  const emailBerubah = email.trim() !== appUser.email;

  async function pilihFoto(file: File) {
    setProfilErr('');
    setProfilOk('');
    if (!ALLOWED_MIME.includes(file.type)) {
      setProfilErr('Foto profil harus berformat JPG, PNG, atau WEBP.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setProfilErr('Ukuran foto maksimal 3MB.');
      return;
    }
    setFotoBusy(true);
    try {
      const data = await fileToBase64(file);
      await apiFetch<{ ok: true; url: string }>('/api/profil/foto', {
        method: 'POST',
        body: { filename: file.name, mimeType: file.type, data },
      });
      await refreshAppUser();
      setProfilOk('✓ Foto profil diperbarui.');
    } catch (e: any) {
      setProfilErr(e?.message || 'Gagal mengunggah foto.');
    } finally {
      setFotoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function hapusFoto() {
    if (fotoBusy) return;
    setProfilErr('');
    setProfilOk('');
    setFotoBusy(true);
    try {
      await apiFetch('/api/profil/foto', { method: 'DELETE' });
      await refreshAppUser();
      setProfilOk('✓ Foto profil dihapus.');
    } catch (e: any) {
      setProfilErr(e?.message || 'Gagal menghapus foto.');
    } finally {
      setFotoBusy(false);
    }
  }

  async function simpanProfil() {
    if (profilBusy || !appUser) return;
    setProfilErr('');
    setProfilOk('');
    const namaBaru = nama.trim();
    const emailBaru = email.trim();
    if (!namaBaru) {
      setProfilErr('Nama tidak boleh kosong.');
      return;
    }
    if (!emailBaru) {
      setProfilErr('Email tidak boleh kosong.');
      return;
    }
    // Email adalah identitas login — Firebase mewajibkan autentikasi ulang
    // sebelum menggantinya, jadi kata sandi saat ini harus diisi.
    if (emailBaru !== appUser.email && !sandiSaatIni) {
      setProfilErr('Isi kata sandi saat ini untuk mengganti email.');
      return;
    }
    setProfilBusy(true);
    try {
      if (emailBaru !== appUser.email) {
        const user = auth?.currentUser;
        if (!user?.email) throw new Error('Sesi berakhir — silakan masuk ulang.');
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, sandiSaatIni));
        await updateEmail(user, emailBaru);
      }
      await apiFetch('/api/profil', {
        method: 'PATCH',
        body: {
          nama: namaBaru,
          email: emailBaru,
          ...(isDosen ? { prodiHomebase: prodi || null } : {}),
        },
      });
      await refreshAppUser();
      setSandiSaatIni('');
      setProfilOk('✓ Profil berhasil disimpan.');
    } catch (e: any) {
      setProfilErr(authErrorMessage(e, 'Gagal menyimpan profil.'));
    } finally {
      setProfilBusy(false);
    }
  }

  async function gantiSandi() {
    if (sandiBusy) return;
    setSandiErr('');
    setSandiOk('');
    if (!sandiLama) {
      setSandiErr('Isi kata sandi saat ini.');
      return;
    }
    if (sandiBaru.length < 6) {
      setSandiErr('Kata sandi baru minimal 6 karakter.');
      return;
    }
    if (sandiBaru !== sandiUlang) {
      setSandiErr('Konfirmasi kata sandi tidak cocok.');
      return;
    }
    setSandiBusy(true);
    try {
      const user = auth?.currentUser;
      if (!user?.email) throw new Error('Sesi berakhir — silakan masuk ulang.');
      // Firebase menolak updatePassword tanpa login yang masih "segar",
      // jadi selalu autentikasi ulang dulu dengan kata sandi saat ini.
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, sandiLama));
      await updatePassword(user, sandiBaru);
      setSandiLama('');
      setSandiBaru('');
      setSandiUlang('');
      setSandiOk('✓ Kata sandi berhasil diganti. Pakai kata sandi baru saat masuk berikutnya.');
    } catch (e: any) {
      setSandiErr(authErrorMessage(e, 'Gagal mengganti kata sandi.'));
    } finally {
      setSandiBusy(false);
    }
  }

  const btn = (disabled: boolean) => ({
    padding: '11px 20px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 700,
    color: colors.white, background: disabled ? colors.disabled : colors.green,
    cursor: disabled ? 'not-allowed' : 'pointer',
  });

  return (
    <div className="silapa-fade" style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 680 }}>
      <Card>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 16 }}>Foto profil</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          {appUser.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={appUser.fotoUrl}
              alt={`Foto profil ${appUser.nama}`}
              width={84}
              height={84}
              style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${colors.border}` }}
            />
          ) : (
            <div style={{ width: 84, height: 84, borderRadius: '50%', background: colors.yellow, color: colors.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800 }}>
              {initials(appUser.nama)}
            </div>
          )}
          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => fileRef.current?.click()} disabled={fotoBusy} style={btn(fotoBusy)}>
                {fotoBusy ? 'Memproses…' : appUser.fotoUrl ? 'Ganti Foto' : 'Unggah Foto'}
              </button>
              {appUser.fotoUrl && (
                <button
                  onClick={hapusFoto}
                  disabled={fotoBusy}
                  style={{ padding: '11px 18px', borderRadius: 9, border: `1px solid ${colors.border}`, background: colors.surface, fontSize: 13, fontWeight: 700, color: colors.danger, cursor: fotoBusy ? 'not-allowed' : 'pointer' }}
                >
                  Hapus Foto
                </button>
              )}
            </div>
            <span style={{ display: 'block', fontSize: 11.5, color: colors.faint, marginTop: 8, lineHeight: 1.5 }}>
              JPG, PNG, atau WEBP — maksimal 3MB. Foto disimpan di Google Drive fakultas.
            </span>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files?.[0] && pilihFoto(e.target.files[0])}
        />
      </Card>

      <Card>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 14 }}>Data diri</span>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Nama lengkap</label>
          <input value={nama} onChange={(e) => setNama(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Email (dipakai untuk masuk)</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        </div>
        {isDosen && (
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Prodi homebase</label>
            <select value={prodi} onChange={(e) => setProdi(e.target.value)} style={inputStyle}>
              <option value="">— belum ditentukan —</option>
              <option value="K3">K3</option>
              <option value="KL">KL</option>
              <option value="S2KM">S2KM</option>
            </select>
          </div>
        )}
        {emailBerubah && (
          <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 10, background: colors.subtle, border: `1px solid ${colors.border}` }}>
            <label style={labelStyle}>Kata sandi saat ini (wajib untuk ganti email)</label>
            <input
              type="password"
              value={sandiSaatIni}
              onChange={(e) => setSandiSaatIni(e.target.value)}
              placeholder="••••••••"
              style={inputStyle}
            />
            <span style={{ display: 'block', fontSize: 11.5, color: colors.muted, marginTop: 8, lineHeight: 1.5 }}>
              Setelah email diganti, gunakan email baru untuk masuk berikutnya. Pastikan alamatnya benar.
            </span>
          </div>
        )}
        {profilErr && (
          <div style={{ background: colors.dangerBg, border: `1px solid ${colors.dangerBorder}`, borderRadius: 10, padding: '10px 14px', fontSize: 12.5, fontWeight: 600, color: colors.danger, marginBottom: 12 }}>
            {profilErr}
          </div>
        )}
        {profilOk && <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: colors.green, marginBottom: 12 }}>{profilOk}</span>}
        <button onClick={simpanProfil} disabled={profilBusy} style={btn(profilBusy)}>
          {profilBusy ? 'Menyimpan…' : 'Simpan Perubahan'}
        </button>
      </Card>

      <Card>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 4 }}>Ganti kata sandi</span>
        <span style={{ fontSize: 12.5, color: colors.muted, display: 'block', marginBottom: 14, lineHeight: 1.5 }}>
          Demi keamanan, kata sandi saat ini selalu diminta sebelum diganti.
        </span>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Kata sandi saat ini</label>
          <input type="password" value={sandiLama} onChange={(e) => setSandiLama(e.target.value)} placeholder="••••••••" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Kata sandi baru (min. 6 karakter)</label>
          <input type="password" value={sandiBaru} onChange={(e) => setSandiBaru(e.target.value)} placeholder="••••••••" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Ulangi kata sandi baru</label>
          <input type="password" value={sandiUlang} onChange={(e) => setSandiUlang(e.target.value)} placeholder="••••••••" style={inputStyle} />
        </div>
        {sandiErr && (
          <div style={{ background: colors.dangerBg, border: `1px solid ${colors.dangerBorder}`, borderRadius: 10, padding: '10px 14px', fontSize: 12.5, fontWeight: 600, color: colors.danger, marginBottom: 12 }}>
            {sandiErr}
          </div>
        )}
        {sandiOk && <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: colors.green, marginBottom: 12 }}>{sandiOk}</span>}
        <button onClick={gantiSandi} disabled={sandiBusy} style={btn(sandiBusy)}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Icon path="M7 11V7a5 5 0 0 1 10 0v4 M5 11h14v10H5V11Z" size={14} stroke={colors.white} />
            {sandiBusy ? 'Menyimpan…' : 'Ganti Kata Sandi'}
          </span>
        </button>
      </Card>
    </div>
  );
}
