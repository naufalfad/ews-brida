import prisma from '../config/prisma.js';
import baselineService from '../services/baselineService.js';
import multer from 'multer';

// Setup multer memory storage configuration
const storage = multer.memoryStorage();
export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // Limit to 10MB
  }
});

/**
 * Handle baseline document upload and automated parsing (TXT, PDF, Images)
 * POST /api/v1/baselines/upload
 */
export const uploadBaselineFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Harap lampirkan file baseline (TXT, PDF, Gambar) pada body request.'
      });
    }

    const { saveToDb = 'true' } = req.query;
    const shouldSave = saveToDb === 'true';

    // 1. Ekstrak teks mentah dari file
    const rawText = await baselineService.extractTextFromFile(req.file);

    // 2. Strukturkan teks ke format baseline menggunakan AI
    const extractedBaselines = await baselineService.structureTextToBaselines(rawText, req.file.originalname);

    const savedItems = [];

    // 3. Simpan ke database jika parameter saveToDb aktif (Upsert berdasarkan kategori unik)
    if (shouldSave) {
      for (const item of extractedBaselines) {
        const saved = await prisma.systemBaseline.upsert({
          where: { category: item.category },
          update: {
            baselineValue: item.baselineValue,
            description: item.description
          },
          create: {
            category: item.category,
            baselineValue: item.baselineValue,
            description: item.description
          }
        });
        savedItems.push(saved);
      }
    }

    return res.status(200).json({
      success: true,
      message: shouldSave 
        ? `Berhasil mengekstrak dan menyimpan ${savedItems.length} baseline ke database.`
        : 'Berhasil mengekstrak data baseline (Simulasi/Tidak Disimpan).',
      data: shouldSave ? savedItems : extractedBaselines
    });

  } catch (error) {
    console.error('Error in uploadBaselineFile controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal memproses file baseline.',
      error: error.message
    });
  }
};

/**
 * Create a new baseline manually via JSON
 * POST /api/v1/baselines
 */
export const createBaseline = async (req, res) => {
  try {
    const { category, baselineValue, description = 'Dibuat secara manual' } = req.body;

    if (!category || !baselineValue) {
      return res.status(400).json({
        success: false,
        message: 'Parameter category dan baselineValue wajib diisi.'
      });
    }

    const newBaseline = await prisma.systemBaseline.upsert({
      where: { category },
      update: {
        baselineValue,
        description
      },
      create: {
        category,
        baselineValue,
        description
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Baseline berhasil disimpan.',
      data: newBaseline
    });
  } catch (error) {
    console.error('Error in createBaseline controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal membuat baseline.',
      error: error.message
    });
  }
};

/**
 * List all system baselines
 * GET /api/v1/baselines
 */
export const getAllBaselines = async (req, res) => {
  try {
    const baselines = await prisma.systemBaseline.findMany({
      orderBy: {
        category: 'asc'
      }
    });

    return res.status(200).json({
      success: true,
      data: baselines
    });
  } catch (error) {
    console.error('Error in getAllBaselines controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil daftar baseline.',
      error: error.message
    });
  }
};
