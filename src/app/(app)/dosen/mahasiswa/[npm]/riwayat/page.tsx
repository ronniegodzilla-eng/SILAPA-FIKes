'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useData } from '@/lib/data-context';
import { useAuth } from '@/lib/auth-context';
import { useSetHeader } from '@/components/AppShell';
import { computeBadges, ipChartGeometry } from '@/lib/compute';
import { fetchRiwayatLaporan } from '@/lib/firestore/data';
import { colors, statusPill, STATUS_LABEL } from '@/lib/theme';
import { Icon, Card, Pill } from '@/components/ui';
import type { RiwayatLaporanRow } from '@/lib/types';

export default function RiwayatPage() {
  const { npm } = useParams<{ npm: string }>();
  const router = useRouter();
  const { records } = useData();
  const { appUser } = useAuth();
  const rec = records[npm];
  const [riwayat, setRiwayat] = useState<RiwayatLaporanRow[]>([]);

  useSetHeader('Riwayat Mahasiswa', rec ? rec.nama : '');

  useEffect(() => {
    if (!appUser) return;
    fetchRiwayatLaporan(npm, appUser.uid)
      .then(setRiwayat)
      .catch(() => setRiwayat([]));
  }, [npm, appUser]);

  if (!rec) {
    return <div style={{ fontSize: 13, color: colors.muted }}>Data mahasiswa tidak ditemukan.</div>;
  }

  const badges = computeBadges(rec);
  const hasIp = rec.ipHistory.length > 0;
  const { points, path } = ipChartGeometry(rec.ipHistory);

  return (
    <div className="silapa-fade" style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 880 }}>
      <div onClick={() => router.push(`/dosen/bimbingan/${npm}`)} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: colors.green, cursor: 'pointer' }}>
        <Icon path="M15 6l-6 6 6 6" size={15} width={2} />
        Kembali ke Form Laporan
      </div>

      <Card padding="20px 24px">
        <div style={{ fontFamily: "'Lora',serif", fontSize: 19, fontWeight: 700, color: colors.ink }}>{rec.nama}</div>
        <div style={{ fontSize: 12.5, color: colors.muted, marginTop: 3 }}>
          NPM {rec.npm} · {rec.prodi} · Angkatan {rec.angkatan}
        </div>
      </Card>

      {badges.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {badges.map((b) => (
            <span key={b.label} style={{ fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 999, color: colors.danger, background: colors.dangerBg, border: `1px solid ${colors.dangerBorder}` }}>
              ⚠ {b.label}
            </span>
          ))}
        </div>
      )}

      <Card padding="20px 24px">
        <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink, display: 'block', marginBottom: 16 }}>Riwayat IP per semester</span>
        {hasIp ? (
          <svg viewBox="0 0 420 160" style={{ width: '100%', height: 'auto', maxWidth: 420 }}>
            <line x1="0" y1="20" x2="420" y2="20" stroke="#EEF1EA" strokeWidth="1" />
            <line x1="0" y1="70" x2="420" y2="70" stroke="#EEF1EA" strokeWidth="1" />
            <line x1="0" y1="120" x2="420" y2="120" stroke="#EEF1EA" strokeWidth="1" />
            <path d={path} fill="none" stroke="#0B6E3C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {points.map((p) => (
              <g key={p.semesterKe}>
                <circle cx={p.x} cy={p.y} r="4" fill="#0B6E3C" />
                <text x={p.x} y="145" fontSize="10.5" fill="#5C6B60" textAnchor="middle">Smt {p.semesterKe}</text>
                <text x={p.x} y={p.labelY} fontSize="11" fontWeight="700" fill="#1B241D" textAnchor="middle">{p.ipStr}</text>
              </g>
            ))}
          </svg>
        ) : (
          <span style={{ fontSize: 12.5, color: colors.faint }}>Belum ada riwayat IP tercatat.</span>
        )}
      </Card>

      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: colors.subtle }}>
              <th style={{ textAlign: 'left', padding: '11px 16px', fontSize: 11.5, fontWeight: 700, color: colors.muted, textTransform: 'uppercase' }}>Semester</th>
              <th style={{ textAlign: 'left', padding: '11px 16px', fontSize: 11.5, fontWeight: 700, color: colors.muted, textTransform: 'uppercase' }}>IP</th>
            </tr>
          </thead>
          <tbody>
            {rec.ipHistory.map((h) => (
              <tr key={h.semesterKe} style={{ borderTop: `1px solid ${colors.rowBorder}` }}>
                <td style={{ padding: '10px 16px', fontSize: 13, color: colors.ink }}>Semester {h.semesterKe}</td>
                <td style={{ padding: '10px 16px', fontSize: 13, color: colors.ink, fontWeight: 700 }}>{h.ip.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Riwayat status & konsultasi lintas periode (PRD D4) */}
      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: `1px solid ${colors.rowBorder}` }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink }}>Riwayat status &amp; konsultasi per periode</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: colors.subtle }}>
              {['Periode', 'Smt', 'Status', 'Konsultasi', 'IP'].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '11px 16px', fontSize: 11.5, fontWeight: 700, color: colors.muted, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {riwayat.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '12px 16px', fontSize: 12.5, color: colors.faint }}>Belum ada riwayat laporan lintas periode.</td></tr>
            )}
            {riwayat.map((r) => {
              const sp = statusPill(r.status);
              return (
                <tr key={r.periodeId} style={{ borderTop: `1px solid ${colors.rowBorder}` }}>
                  <td style={{ padding: '10px 16px', fontSize: 13, color: colors.ink, fontWeight: 600 }}>{r.periodeId}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13, color: colors.ink }}>{r.semesterKe}</td>
                  <td style={{ padding: '10px 16px' }}><Pill label={STATUS_LABEL[r.status] ?? r.status} color={sp.color} bg={sp.bg} capitalize /></td>
                  <td style={{ padding: '10px 16px', fontSize: 13, color: colors.ink }}>{r.jumlahKonsultasi}×</td>
                  <td style={{ padding: '10px 16px', fontSize: 13, color: colors.ink, fontWeight: 700 }}>{r.ipKhs != null ? r.ipKhs.toFixed(2) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
