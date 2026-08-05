import { Router } from 'express';
import { 
  ingestNews,
  triangulateNews, 
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

// TAHAP 0: Ingestion & Smart Scoping Engine
router.post('/ingest-news', ingestNews);

// TAHAP 1: RAG Assembly & Triangulation
router.post('/triangulate-news', triangulateNews);

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
