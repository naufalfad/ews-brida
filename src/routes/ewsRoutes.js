import { Router } from 'express';
import { 
  searchIssues,
  getIssues
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

// Cari isu terbaru di Mimika yang berpotensi kerusuhan/kecemasan berdasarkan baseline
router.post('/search-issues', searchIssues);

// Ambil riwayat isu EWS yang ditemukan
router.get('/issues', getIssues);

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
