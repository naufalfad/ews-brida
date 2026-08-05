import crypto from 'crypto';
import prisma from '../config/prisma.js';
import aiService from '../services/aiService.js';
import pdfService from '../services/pdfService.js';
import searchService from '../services/searchService.js';

/**
 * Menghitung skor kredibilitas berita secara dinamis berdasarkan reputasi sumber & triangulasi berita sejenis.
 */
const calculateCredibility = (sourceName, sourceType, supportingSources = []) => {
  let baseScore = 35; // Default untuk media sosial atau sumber tidak dikenal
  
  const sourceLower = (sourceName || '').toLowerCase();
  const typeLower = (sourceType || '').toLowerCase();
  
  // Whitelist portal berita kredibel Mimika, nasional, & institusi resmi
  const credibleKeywords = [
    'mimikakab.go.id', 'salampapua.com', 'papua60detik.id', 'seputarpapua.com', 
    'radartimika.co.id', 'tabloidjubi.com', 'tribunnews.com', 'detik.com', 
    'kompas.com', 'tempo.co', 'polri.go.id', 'polri', 'pemda', 'humas', 
    'antaranews.com', 'antara'
  ];
  
  const isCredibleMedia = credibleKeywords.some(keyword => sourceLower.includes(keyword)) || 
                           typeLower.includes('media online') || 
                           typeLower.includes('portal berita');

  if (isCredibleMedia) {
    baseScore = 70;
  } else if (
    typeLower.includes('sosmed') || 
    typeLower.includes('sosial media') || 
    typeLower.includes('facebook') || 
    typeLower.includes('instagram') || 
    typeLower.includes('tiktok') || 
    typeLower.includes('youtube') || 
    typeLower.includes('threads') || 
    typeLower.includes('twitter') ||
    typeLower.includes('x')
  ) {
    baseScore = 35;
  }

  // Bonus Triangulasi: Jika ada artikel pendukung (corroborating sources)
  let triangulationBonus = 0;
  if (supportingSources && Array.isArray(supportingSources)) {
    supportingSources.forEach(src => {
      const srcNameLower = (src.source_name || src.source || '').toLowerCase();
      const isSrcCredible = credibleKeywords.some(keyword => srcNameLower.includes(keyword));
      
      if (isSrcCredible) {
        triangulationBonus += 15; // Berita kredibel menyokong
      } else {
        triangulationBonus += 5;  // Sosmed/sumber biasa menyokong
      }
    });
  }

  return Math.min(100, baseScore + triangulationBonus);
};

/**
 * FASE 1: Menyaring berita berpotensi kerusuhan menggunakan live penelusuran internet
 * POST /api/v1/ews/process-news
 */
export const processNews = async (req, res) => {
  try {
    const { sector = 'umum', baselines: customBaselines, baselineIds } = req.body;

    console.log(`[Fase 1] Memulai pencarian berita terkini Mimika untuk sektor "${sector}" langsung dari internet...`);

    // 1. Ambil berita real-time dari internet berdasarkan sektor menggunakan searchService
    const liveArticles = await searchService.searchMimikaNews(sector);

    if (liveArticles.length === 0) {
      return res.status(200).json({
        success: true,
        message: `Tidak ada berita terbaru untuk sektor "${sector}" di internet dalam 24 jam terakhir. Silakan coba sektor lain.`,
        data: []
      });
    }

    // 2. Ambil acuan baseline (bisa dari request body kustom, pilihan database, atau filter berdasarkan sektor)
    let baselines = [];

    if (baselineIds && Array.isArray(baselineIds) && baselineIds.length > 0) {
      baselines = await prisma.systemBaseline.findMany({
        where: { id: { in: baselineIds } }
      });
    }

    if (customBaselines && Array.isArray(customBaselines) && customBaselines.length > 0) {
      const formattedCustom = customBaselines.map(b => ({
        category: b.category,
        baselineValue: b.baselineValue || b.baseline_value,
        description: b.description || 'Baseline Ad-Hoc'
      }));
      baselines = baselines.concat(formattedCustom);
    }

    if (baselines.length === 0) {
      // Coba cari baseline di database yang mencakup nama sektor (case insensitive)
      if (sector && sector !== 'umum') {
        baselines = await prisma.systemBaseline.findMany({
          where: {
            category: {
              contains: sector,
              mode: 'insensitive'
            }
          }
        });
      }
      
      // Fallback ke seluruh baseline jika tidak ada baseline spesifik sektor yang ditemukan
      if (baselines.length === 0) {
        baselines = await prisma.systemBaseline.findMany();
      }
    }

    // 3. Panggil AI Service untuk menyaring dan mencocokkan berita dengan baseline berdasarkan sektor
    const newsReports = await aiService.searchNews(liveArticles, sector, baselines);

    console.log(`[Fase 1] AI menyaring ${newsReports.length} berita berpotensi gangguan EWS untuk sektor "${sector}" dari ${liveArticles.length} berita.`);

    // 4. Simpan berita yang relevan saja ke database raw_articles
    const processedArticles = [];
    
    if (newsReports.length === 0) {
      return res.status(200).json({
        success: true,
        message: `Tidak ada berita berpotensi kerusuhan pada sektor "${sector}" dalam 24 jam terakhir.`,
        data: []
      });
    }

    for (const report of newsReports) {
      // Ambil sumber utama dari array sources yang dikembalikan AI
      const primarySource = report.sources && report.sources[0] 
        ? report.sources[0] 
        : { source_name: 'Media Online', url: '' };

      // Hitung skor kredibilitas secara dinamis berdasarkan whitelist & jumlah sumber pendukung
      const calculatedScore = calculateCredibility(
        primarySource.source_name,
        'Media Online',
        report.sources ? report.sources.slice(1).map(s => ({ source_name: s.source_name, url: s.url })) : []
      );

      console.log(`[Fase 1] Menyimpan EWS berita: "${report.title}" (Kredibilitas: ${calculatedScore}, Sumber: ${report.sources?.length || 1})`);

      // Periksa duplikasi judul berita di database untuk menghindari duplikasi record
      let dbArticle = await prisma.rawArticle.findFirst({
        where: { title: report.title }
      });

      if (!dbArticle) {
        // Masukkan artikel baru yang lolos penyaringan EWS
        dbArticle = await prisma.rawArticle.create({
          data: {
            title: report.title,
            sourceName: primarySource.source_name,
            sourceType: 'Media Online',
            url: primarySource.url,
            content: report.content,
            publishedAt: new Date(), // Google RSS results are within last 24h
            credibilityScore: parseFloat(calculatedScore),
            triangulationGroup: null, // Dinonaktifkan sementara di Fase 1 sesuai request
            credibilityFactors: {
              content: report.content,
              potentialImpact: report.potential_impact,
              sources: report.sources,
              isRelevantToEws: true
            }
          }
        });
      } else {
        // Jika sudah ada, update parameter EWS terbarunya
        dbArticle = await prisma.rawArticle.update({
          where: { id: dbArticle.id },
          data: {
            content: report.content,
            credibilityScore: parseFloat(calculatedScore),
            triangulationGroup: null, // Dinonaktifkan sementara
            credibilityFactors: {
              content: report.content,
              potentialImpact: report.potential_impact,
              sources: report.sources,
              isRelevantToEws: true
            }
          }
        });
      }

      processedArticles.push(dbArticle);
    }

    return res.status(200).json({
      success: true,
      message: `Penyaringan berita selesai. Ditemukan ${processedArticles.length} berita berpotensi kerusuhan pada sektor "${sector}".`,
      data: processedArticles
    });
  } catch (error) {
    console.error('Error in processNews controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal memproses dan menyaring berita terkini.',
      error: error.message,
    });
  }
};

/**
 * FASE 2: Membuat analisis dampak & kerawanan daerah terhadap RKPD berdasarkan berita kredibel
 * POST /api/v1/ews/run-regional-analysis
 */
export const runRegionalAnalysis = async (req, res) => {
  try {
    const { triangulationGroup } = req.body;
    let credibleArticles = [];

    if (triangulationGroup) {
      console.log(`[Fase 2] Mengambil berita terverifikasi untuk kelompok isu: "${triangulationGroup}"...`);
      credibleArticles = await prisma.rawArticle.findMany({
        where: {
          triangulationGroup: triangulationGroup,
          credibilityScore: {
            gte: 50.0
          }
        },
        orderBy: {
          createdAt: 'desc',
        }
      });
    } else {
      console.log(`[Fase 2] Mengambil 10 berita terverifikasi terbaru secara umum...`);
      credibleArticles = await prisma.rawArticle.findMany({
        where: {
          credibilityScore: {
            gte: 50.0
          }
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 10
      });
    }

    if (credibleArticles.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tidak menemukan berita terverifikasi. Silakan jalankan Fase 1 terlebih dahulu.',
      });
    }

    // Ambil acuan baseline (bisa dari request kustom, pilihan database, atau seluruhnya di DB)
    const { baselines: customBaselines, baselineIds } = req.body;
    let baselines = [];

    if (baselineIds && Array.isArray(baselineIds) && baselineIds.length > 0) {
      baselines = await prisma.systemBaseline.findMany({
        where: { id: { in: baselineIds } }
      });
    }

    if (customBaselines && Array.isArray(customBaselines) && customBaselines.length > 0) {
      const formattedCustom = customBaselines.map(b => ({
        category: b.category,
        baselineValue: b.baselineValue || b.baseline_value,
        description: b.description || 'Baseline Ad-Hoc'
      }));
      baselines = baselines.concat(formattedCustom);
    }

    if (baselines.length === 0) {
      baselines = await prisma.systemBaseline.findMany();
    }

    // Panggil AI Service untuk menganalisis relasi berita dengan target RKPD
    const { analysis, rawResponse } = await aiService.analyzeRegionalImpact(credibleArticles, baselines);

    const batchId = crypto.randomUUID();

    // Simpan awal analisis ke database (belum memuat rekomendasi aksi & OPD)
    const newAnalysis = await prisma.ewsAnalysis.create({
      data: {
        batchId: batchId,
        riskLevel: analysis.risk_level,
        primaryCategory: analysis.primary_category,
        targetDistrict: analysis.target_district,
        summary: analysis.summary,
        predictedImpact: analysis.predicted_impact,
        recommendedActions: [], // Akan diisi pada Fase 3
        responsibleOpd: '',      // Akan diisi pada Fase 3
        isHoaxPotential: false,  // Evaluasi hoax
        rawAiResponse: rawResponse,
        sourceRefs: credibleArticles.map(a => ({
          id: a.id,
          title: a.title,
          url: a.url,
          sourceName: a.sourceName,
          sourceType: a.sourceType,
          publishedAt: a.publishedAt,
          credibilityScore: a.credibilityScore
        }))
      }
    });

    // Buat Audit Log
    await prisma.auditLog.create({
      data: {
        userId: req.headers['x-user-id'] || 'SYSTEM_BRIDA',
        actionType: 'GENERATE_ANALYSIS',
        analysisId: newAnalysis.id,
        notes: `Membuat analisis dampak wilayah. Risiko: ${analysis.risk_level}.`,
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Analisis dampak wilayah terhadap RKPD selesai dibuat.',
      data: newAnalysis
    });
  } catch (error) {
    console.error('Error in runRegionalAnalysis controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal membuat analisis dampak wilayah.',
      error: error.message,
    });
  }
};

/**
 * FASE 3: Menghasilkan rekomendasi aksi dan OPD penanggung jawab
 * POST /api/v1/ews/generate-recommendations
 */
export const generateRecommendations = async (req, res) => {
  try {
    const { analysisId } = req.body;

    if (!analysisId) {
      return res.status(400).json({
        success: false,
        message: 'Parameter analysisId wajib disertakan.',
      });
    }

    console.log(`[Fase 3] Mengambil data analisis ID: ${analysisId}...`);

    const analysis = await prisma.ewsAnalysis.findUnique({
      where: { id: analysisId }
    });

    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: 'Hasil analisis tidak ditemukan.',
      });
    }

    // Panggil AI Service untuk menyusun rekomendasi aksi dan memetakan OPD dinas terkait
    const recommendations = await aiService.generateOpdRecommendations({
      primaryCategory: analysis.primaryCategory,
      targetDistrict: analysis.targetDistrict,
      riskLevel: analysis.riskLevel,
      summary: analysis.summary,
      predictedImpact: analysis.predictedImpact
    });

    // Update data analisis dengan rekomendasi & OPD terkait
    const updatedAnalysis = await prisma.ewsAnalysis.update({
      where: { id: analysisId },
      data: {
        recommendedActions: recommendations.recommended_actions,
        responsibleOpd: recommendations.responsible_opd
      }
    });

    // Buat Audit Log
    await prisma.auditLog.create({
      data: {
        userId: req.headers['x-user-id'] || 'SYSTEM_BRIDA',
        actionType: 'GENERATE_RECOMMENDATIONS',
        analysisId: analysisId,
        notes: `Rekomendasi taktis berhasil dibuat untuk OPD: ${recommendations.responsible_opd}.`,
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Rekomendasi taktis mitigasi OPD berhasil dibuat.',
      data: updatedAnalysis
    });
  } catch (error) {
    console.error('Error in generateRecommendations controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal merumuskan rekomendasi OPD.',
      error: error.message,
    });
  }
};

/**
 * FASE 4: Membuat berkas laporan PDF resmi BRIDA Mimika
 * GET /api/v1/ews/analyses/:id/pdf
 */
export const generatePdfReport = async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`[Fase 4] Menyiapkan unduhan PDF untuk analisis ID: ${id}...`);

    const analysis = await prisma.ewsAnalysis.findUnique({
      where: { id: id }
    });

    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: 'Hasil analisis tidak ditemukan untuk dicetak.',
      });
    }

    // Atur Header agar browser mendownload PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Laporan_EWS_BRIDA_${analysis.batchId.slice(0, 8)}.pdf`
    );

    // Kirim PDF langsung ke stream response
    pdfService.generateEwsReport(analysis, res);
  } catch (error) {
    console.error('Error in generatePdfReport controller:', error);
    // Jika header sudah dikirim, kita tidak bisa kirim JSON error
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Gagal men-generate laporan PDF.',
        error: error.message,
      });
    }
  }
};

/**
 * Helper to fetch EWS analyses history list
 * GET /api/v1/ews/analyses
 */
export const getAnalysesHistory = async (req, res) => {
  try {
    const history = await prisma.ewsAnalysis.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        AuditLogs: true,
      },
    });

    return res.status(200).json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error('Error fetching analysis history:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil riwayat analisis.',
      error: error.message,
    });
  }
};
