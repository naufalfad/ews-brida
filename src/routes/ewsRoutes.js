import { Router } from 'express';
import { 
  searchIssues,
  getIssues,
  verifyIssue,
  analyzeIssue,
  mitigateIssue,
  generateReportDraft,
  saveReport,
  getReports,
  getReportByIssue,
  printReportPdf,
  getDashboardSummary,
  getGisIssues,
  updateIssueDistrict
} from '../controllers/ewsController.js';
import {
  upload,
  uploadBaselineFile,
  createBaseline,
  getAllBaselines
} from '../controllers/baselineController.js';

const router = Router();

// ==========================================
// TAHAP 1: PENCARIAN & PENYARINGAN ISU EWS
// ==========================================

// Ambil Ringkasan Dashboard
router.get('/dashboard-summary', getDashboardSummary);

// Cari isu terbaru di Mimika yang berpotensi kerusuhan/kecemasan berdasarkan baseline
router.post('/search-issues', upload.array('files', 5), searchIssues);

// Ambil riwayat isu EWS yang ditemukan
router.get('/issues', getIssues);

// Ambil isu terverifikasi untuk Peta GIS
router.get('/gis-issues', getGisIssues);

// ==========================================
// TAHAP 2: EVALUASI KREDIBILAS & CEK HOAX
// ==========================================

// Verifikasi kredibilitas / cek hoax isu EWS terpilih
router.post('/issues/:id/verify', verifyIssue);

// ==========================================
// TAHAP 3: ANALISIS MENDALAM DAMPAK ISU
// ==========================================

// Analisis mendalam dampak isu EWS terpilih (berstatus VERIFIED_CREDIBLE)
router.post('/issues/:id/analyze', analyzeIssue);

// Koreksi validasi geografis manual (Human-in-the-Loop)
router.put('/issues/:id/district', updateIssueDistrict);

// ==========================================
// TAHAP 4: MITIGASI & REKOMENDASI OPD
// ==========================================

// Rancang mitigasi dan rekomendasi OPD isu EWS terpilih (berstatus ANALYZED)
router.post('/issues/:id/mitigate', mitigateIssue);

// ==========================================
// TAHAP 5: LAPORAN RESMI & EKSPOR PDF
// ==========================================

// Buat draf laporan dinas menggunakan AI
router.post('/issues/:id/report/draft', generateReportDraft);

// Mengambil laporan resmi yang sudah disimpan untuk isu ini
router.get('/issues/:id/report', getReportByIssue);

// Simpan laporan resmi kustom yang sudah diedit user
router.post('/issues/:id/report', saveReport);

// List riwayat laporan yang tersimpan di database
router.get('/reports', getReports);

// Cetak PDF laporan kustom dari database
router.get('/reports/:reportId/pdf', printReportPdf);

// ==========================================
// PENGELOLAAN BASELINE ACUAN
// ==========================================

// Upload file baseline (TXT, PDF, Gambar)
router.post('/baselines/upload', upload.single('file'), uploadBaselineFile);

// Buat baseline secara manual (JSON)
router.post('/baselines', createBaseline);

// List semua baseline di database
router.get('/baselines', getAllBaselines);

export default router;
