import { Router } from 'express';
import { getAllDistricts, seedDistricts } from '../controllers/districtController.js';

const router = Router();

// Ambil semua data Master Distrik
router.get('/', getAllDistricts);

// Jalankan seeder untuk mengisi 18 distrik Mimika awal
router.post('/seed', seedDistricts);

export default router;
