import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET /api/v1/ews/districts
export const getAllDistricts = async (req, res) => {
  try {
    const districts = await prisma.masterDistrict.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { Issues: true }
        },
        Issues: {
          select: { riskLevel: true }
        }
      }
    });
    
    return res.status(200).json({
      success: true,
      data: districts
    });
  } catch (error) {
    console.error('[DistrictController] Gagal mengambil distrik:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil data distrik.',
      error: error.message
    });
  }
};

// POST /api/v1/ews/districts/seed
export const seedDistricts = async (req, res) => {
  try {
    const mockDistricts = [
      { code: 'MMK-AGI', name: 'Agimuga', centerLat: -4.6833, centerLng: 137.3833, population: 4200, vulnerabilityIndex: 'TINGGI' },
      { code: 'MMK-TBP', name: 'Tembagapura', centerLat: -4.1481, centerLng: 137.1128, population: 21500, vulnerabilityIndex: 'TINGGI' },
      { code: 'MMK-BRU', name: 'Mimika Baru', centerLat: -4.5464, centerLng: 136.8836, population: 142000, vulnerabilityIndex: 'SEDANG' },
      { code: 'MMK-KLC', name: 'Kuala Kencana', centerLat: -4.4322, centerLng: 136.8521, population: 28000, vulnerabilityIndex: 'RENDAH' },
      { code: 'MMK-WNA', name: 'Wania', centerLat: -4.5821, centerLng: 136.9211, population: 62000, vulnerabilityIndex: 'SEDANG' },
      { code: 'MMK-JTA', name: 'Jita', centerLat: -4.8111, centerLng: 137.7212, population: 3100, vulnerabilityIndex: 'TINGGI' },
      { code: 'MMK-MMT', name: 'Mimika Timur', centerLat: -4.6465, centerLng: 136.9934, population: 23000, vulnerabilityIndex: 'RENDAH' },
      { code: 'MMK-MTJ', name: 'Mimika Timur Jauh', centerLat: -4.7501, centerLng: 137.1213, population: 15000, vulnerabilityIndex: 'RENDAH' },
      { code: 'MMK-MTH', name: 'Mimika Tengah', centerLat: -4.6821, centerLng: 136.8812, population: 12000, vulnerabilityIndex: 'SEDANG' },
      { code: 'MMK-MMB', name: 'Mimika Barat', centerLat: -4.6133, centerLng: 136.5412, population: 11000, vulnerabilityIndex: 'SEDANG' },
      { code: 'MMK-MBJ', name: 'Mimika Barat Jauh', centerLat: -4.5211, centerLng: 136.2134, population: 4000, vulnerabilityIndex: 'RENDAH' },
      { code: 'MMK-MBT', name: 'Mimika Barat Tengah', centerLat: -4.5613, centerLng: 136.3812, population: 5000, vulnerabilityIndex: 'RENDAH' },
      { code: 'MMK-KWN', name: 'Kwamki Narama', centerLat: -4.5233, centerLng: 136.8923, population: 32000, vulnerabilityIndex: 'TINGGI' },
      { code: 'MMK-HOY', name: 'Hoya', centerLat: -4.1834, centerLng: 137.2831, population: 2000, vulnerabilityIndex: 'TINGGI' },
      { code: 'MMK-JLA', name: 'Jila', centerLat: -4.2341, centerLng: 137.4932, population: 2500, vulnerabilityIndex: 'SEDANG' },
      { code: 'MMK-AMR', name: 'Amar', centerLat: -4.6712, centerLng: 136.7021, population: 3500, vulnerabilityIndex: 'RENDAH' },
      { code: 'MMK-ALM', name: 'Alama', centerLat: -4.1231, centerLng: 137.4012, population: 1500, vulnerabilityIndex: 'RENDAH' },
      { code: 'MMK-IWK', name: 'Iwaka', centerLat: -4.4812, centerLng: 136.7821, population: 8000, vulnerabilityIndex: 'SEDANG' }
    ];

    let createdCount = 0;
    for (const district of mockDistricts) {
      const exists = await prisma.masterDistrict.findUnique({
        where: { code: district.code }
      });

      if (!exists) {
        await prisma.masterDistrict.create({
          data: district
        });
        createdCount++;
      }
    }

    return res.status(200).json({
      success: true,
      message: `${createdCount} distrik berhasil ditambahkan ke database.`
    });
  } catch (error) {
    console.error('[DistrictController] Gagal melakukan seeder distrik:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal melakukan seeder data distrik.',
      error: error.message
    });
  }
};
