/**
 * Design tokens extracted verbatim from the Claude Design prototype
 * (SILAPA-FIKes.dc.html). Keeping them centralized lets every screen
 * reproduce the mock pixel-for-pixel.
 */
export const colors = {
  // Surfaces
  appBg: '#F5F7F1',
  surface: '#FFFFFF',
  subtle: '#F5F7F1',
  subtleAlt: '#FAFBF8',

  // Brand green
  green: '#0B6E3C',
  greenDark: '#073B21',
  greenDarkest: '#052818',
  greenMid: '#3E9A64',
  greenBrightLogin: '#0E7F45',
  greenSoftBg: '#E5F3EA',
  greenSoftBorder: '#BFE0CC',

  // Accent
  yellow: '#F5D000',

  // Text
  ink: '#1B241D',
  muted: '#5C6B60',
  faint: '#93A398',

  // Borders / dividers
  border: '#E3E7DE',
  rowBorder: '#EEF1EA',
  track: '#EFF2EA',
  scrollThumb: '#C7D2C1',

  // Status — aktif
  statusAktifText: '#0B6E3C',
  statusAktifBg: '#E5F3EA',
  // cuti
  statusCutiText: '#5C7A99',
  statusCutiBg: '#EAF1F6',
  // non_aktif / danger
  danger: '#B0453A',
  dangerBg: '#FBEAE8',
  dangerBorder: '#F3CFC9',
  // lulus
  statusLulusText: '#8A6D0B',
  statusLulusBg: '#FBF3D9',

  // Warning / amber
  amber: '#E8A33D',
  amberText: '#8A5A0B',
  amberBg: '#FBF1DC',

  // Confirm banner
  warnBannerBg: '#FBF6E3',
  warnBannerBorder: '#F0DFA0',

  // Disabled button
  disabled: '#B7C2B1',

  white: '#FFFFFF',
} as const;

export const fonts = {
  sans: "'Plus Jakarta Sans', sans-serif",
  serif: "'Lora', serif",
};

/** status enum (mahasiswa/laporan) → pill colors */
export function statusPill(status: string): { color: string; bg: string } {
  const map: Record<string, { color: string; bg: string }> = {
    aktif: { color: '#0B6E3C', bg: '#E5F3EA' },
    cuti: { color: '#5C7A99', bg: '#EAF1F6' },
    non_aktif: { color: '#B0453A', bg: '#FBEAE8' },
    lulus: { color: '#8A6D0B', bg: '#FBF3D9' },
  };
  return map[status] || { color: '#5C6B60', bg: '#EFF2EA' };
}

/** statusPengisian → pill colors */
export function kelengkapanPill(k: string): { color: string; bg: string } {
  const map: Record<string, { color: string; bg: string }> = {
    lengkap: { color: '#0B6E3C', bg: '#E5F3EA' },
    sebagian: { color: '#8A5A0B', bg: '#FBF1DC' },
    kosong: { color: '#B0453A', bg: '#FBEAE8' },
  };
  return map[k] || { color: '#5C6B60', bg: '#EFF2EA' };
}

/** submission statusKirim → pill colors */
export function kirimPill(status: string): { color: string; bg: string } {
  const map: Record<string, { color: string; bg: string }> = {
    draft: { color: '#5C6B60', bg: '#EFF2EA' },
    dikirim: { color: '#8A5A0B', bg: '#FBF1DC' },
    dikembalikan: { color: '#B0453A', bg: '#FBEAE8' },
    diverifikasi: { color: '#0B6E3C', bg: '#E5F3EA' },
  };
  return map[status] || { color: '#5C6B60', bg: '#EFF2EA' };
}

/** periode status → pill colors */
export function periodePill(status: string): { color: string; bg: string } {
  const map: Record<string, { color: string; bg: string }> = {
    draft: { color: '#5C6B60', bg: '#EFF2EA' },
    dibuka: { color: '#0B6E3C', bg: '#E5F3EA' },
    verifikasi: { color: '#8A5A0B', bg: '#FBF1DC' },
    dikunci: { color: '#B0453A', bg: '#FBEAE8' },
  };
  return map[status] || { color: '#5C6B60', bg: '#EFF2EA' };
}

export const STATUS_LABEL: Record<string, string> = {
  aktif: 'Aktif',
  cuti: 'Cuti',
  non_aktif: 'Non-aktif',
  lulus: 'Lulus',
};

export const KELENGKAPAN_LABEL: Record<string, string> = {
  lengkap: 'Lengkap',
  sebagian: 'Sebagian',
  kosong: 'Kosong',
};

export const KIRIM_LABEL: Record<string, string> = {
  draft: 'Belum mulai',
  dikirim: 'Dikirim',
  dikembalikan: 'Dikembalikan',
  diverifikasi: 'Diverifikasi',
};

export const NAV_ICONS = {
  dashboard: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  list: 'M4 6h16 M4 12h16 M4 18h10',
  database:
    'M4 5c0-1.1 3.6-2 8-2s8 .9 8 2v14c0 1.1-3.6 2-8 2s-8-.9-8-2V5Z M4 5c0 1.1 3.6 2 8 2s8-.9 8-2 M4 12c0 1.1 3.6 2 8 2s8-.9 8-2',
  upload: 'M12 16V4 M7 9l5-5 5 5 M4 20h16',
  shuffle: 'M4 6h4l8 12h4 M16 6h4v4 M4 18h4l8-12h4 M16 18h4v-4',
  calendar: 'M4 5h16v16H4V5Z M4 9h16 M8 3v4 M16 3v4',
  gauge: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 12l4-4',
  check: 'M5 13l4 4L19 7',
  download: 'M12 4v12 M7 11l5 5 5-5 M4 20h16',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
} as const;
