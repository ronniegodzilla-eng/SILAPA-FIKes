/**
 * Demo/login accounts. Data mahasiswa & distribusi dosen PA TIDAK lagi
 * di-hardcode di sini — data riil di-seed dari
 * data/distribusi-dosen-pa.json (hasil ekstraksi PDF SIAKAD) oleh
 * scripts/seed.ts.
 */
export const DEMO_USERS = [
  { email: 'roni@uis.ac.id', password: 'silapa123', nama: 'RONI SAPUTRA, S.Si, M.Si', role: 'dosen_pa' as const, prodiHomebase: 'K3' as const },
  { email: 'admin.fikes@uis.ac.id', password: 'silapa123', nama: 'Admin Fakultas FIKes', role: 'admin' as const, prodiHomebase: null },
  { email: 'wadek1.fikes@uis.ac.id', password: 'silapa123', nama: 'Dr. Hj. Ifadha Adiningsih, M.Kes.', role: 'wadek1' as const, prodiHomebase: null },
];
