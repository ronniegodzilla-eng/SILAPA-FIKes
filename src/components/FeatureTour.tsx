'use client';

import { useEffect, useState } from 'react';
import { colors } from '@/lib/theme';

export interface TourStep {
  /** Selektor CSS elemen yang disorot — bisa data-tour="..." atau selektor lain (mis. a[href]). */
  target: string;
  title: string;
  body: string;
}

/**
 * Tur fitur singkat (spotlight + tooltip) yang tampil otomatis sekali saja
 * saat pengguna pertama kali login — status "sudah lihat" disimpan per-uid
 * di localStorage (bukan Firestore, cukup untuk kebutuhan onboarding ringan).
 * Ditaruh di halaman beranda tiap peran (bukan di AppShell) supaya otomatis
 * berhenti kalau pengguna berpindah halaman di tengah tur.
 */
export function FeatureTour({ steps, storageKey }: { steps: TourStep[]; storageKey: string }) {
  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey)) return;
    } catch {
      // localStorage tidak tersedia — jangan paksa tampilkan tur tiap kunjungan.
      return;
    }
    const t = setTimeout(() => setActive(true), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!active) return;
    function measure() {
      const el = document.querySelector(steps[stepIdx]?.target ?? '');
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      // Elemen ada di DOM tapi sedang tidak terlihat (mis. sidebar mobile
      // ditutup via transform: translateX di luar layar) — jangan sorot
      // posisi yang salah, fallback ke mode tanpa kotak (backdrop penuh).
      const visible = r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0
        && r.left < window.innerWidth && r.top < window.innerHeight;
      setRect(visible ? r : null);
    }
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const t = setInterval(measure, 300); // jaga-jaga elemen bergeser (data async masuk)
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      clearInterval(t);
    };
  }, [active, stepIdx, steps]);

  function finish() {
    setActive(false);
    try {
      localStorage.setItem(storageKey, '1');
    } catch {
      // Tidak bisa disimpan — tur mungkin muncul lagi sesi berikutnya, tidak fatal.
    }
  }

  function next() {
    if (stepIdx >= steps.length - 1) {
      finish();
      return;
    }
    setStepIdx((i) => i + 1);
  }

  if (!active || steps.length === 0) return null;
  const step = steps[stepIdx];
  const pad = 8;
  const box = rect
    ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
    : null;

  const tooltipWidth = 320;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 800;
  let tooltipTop = box ? box.top + box.height + 12 : vh / 2 - 80;
  const tooltipLeft = box
    ? Math.min(Math.max(box.left, 12), vw - tooltipWidth - 12)
    : Math.max(12, vw / 2 - tooltipWidth / 2);
  if (box && tooltipTop + 180 > vh) {
    tooltipTop = Math.max(12, box.top - 190);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
      {box ? (
        <div
          style={{
            position: 'fixed',
            top: box.top, left: box.left, width: box.width, height: box.height,
            borderRadius: 10,
            boxShadow: '0 0 0 9999px rgba(7,20,12,0.65)',
            border: `2px solid ${colors.yellow}`,
            transition: 'top .2s ease, left .2s ease, width .2s ease, height .2s ease',
            pointerEvents: 'none',
          }}
        />
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,20,12,0.65)' }} />
      )}

      <div
        style={{
          position: 'fixed', top: tooltipTop, left: tooltipLeft, width: tooltipWidth,
          background: colors.surface, borderRadius: 14, padding: '18px 20px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Langkah {stepIdx + 1} dari {steps.length}
        </span>
        <div style={{ fontSize: 15, fontWeight: 800, color: colors.ink, marginTop: 6, marginBottom: 6 }}>{step.title}</div>
        <div style={{ fontSize: 12.5, color: colors.ink, lineHeight: 1.5, marginBottom: 16 }}>{step.body}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span onClick={finish} style={{ fontSize: 12, fontWeight: 700, color: colors.muted, cursor: 'pointer' }}>
            Lewati
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {stepIdx > 0 && (
              <button
                onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.surface, fontSize: 12.5, fontWeight: 700, color: colors.ink, cursor: 'pointer' }}
              >
                Kembali
              </button>
            )}
            <button
              onClick={next}
              style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: colors.green, color: colors.white, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
            >
              {stepIdx >= steps.length - 1 ? 'Selesai' : 'Lanjut'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
