import { Router } from 'express';
import { 
  processNews, 
  runRegionalAnalysis, 
  generateRecommendations, 
  generatePdfReport,
  getAnalysesHistory
} from '../controllers/ewsController.js';
import {
  upload,
  uploadBaselineFile,
  createBaseline,
  getAllBaselines
} from '../controllers/baselineController.js';

const router = Router();

// FASE 1: Kredibilitas & Triangulasi Berita Hari Ini
router.post('/process-news', processNews);

// FASE 2: Buat Analisis Dampak RKPD
router.post('/run-regional-analysis', runRegionalAnalysis);

// FASE 3: Susun Rekomendasi Aksi & OPD Terkait
router.post('/generate-recommendations', generateRecommendations);

// FASE 4: Cetak Laporan PDF Resmi BRIDA Mimika
router.get('/analyses/:id/pdf', generatePdfReport);

// Helper: Riwayat Analisis EWS
router.get('/analyses', getAnalysesHistory);

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
