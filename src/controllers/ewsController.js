import crypto from 'crypto';
import prisma from '../config/prisma.js';
import aiService from '../services/aiService.js';
import pdfService from '../services/pdfService.js';
import searchService from '../services/searchService.js';
import baselineService from '../services/baselineService.js';

/**
 * Controller Tahap 1: Ingest & Filter Raw News
 */
export async function ingestNews(req, res) {
  try {
    // 1. Ambil Data Baseline acuan
    // Get baselines via Prisma directly if baselineService.getBaselines doesn't exist, but we will try baselineService or prisma
    let baselines = [];
    if (baselineService && baselineService.getBaselines) {
      baselines = await baselineService.getBaselines();
    } else {
      baselines = await prisma.systemBaseline.findMany();
    }

    // 2. Generasi Query Pencarian via OpenAI (Fase 0)
    const queries = await aiService.generateSearchQueries(baselines);

    // 3. Ambil Berita Mentah via Search Engine API
    const rawArticles = await searchService.executeBatchSearch(queries);

    return res.status(200).json({
      success: true,
      message: `Tahap 1 Berhasil: Mengumpulkan ${rawArticles.length} artikel terfilter untuk wilayah Mimika.`,
      data: {
        generatedQueries: queries,
        totalArticlesFound: rawArticles.length,
        articles: rawArticles
      }
    });
  } catch (error) {
    console.error('Error in ingestNews:', error);
    return res.status(500).json({
      success: false,
      error: `Gagal menjalankan Ingestion Tahap 1: ${error.message}`
    });
  }
}

/**
 * FASE 1: Menyaring berita berpotensi kerusuhan menggunakan live penelusuran internet
 * POST /api/v1/ews/process-news
 */
export const processNews = async (req, res) => {
  try {
    console.log(`[Fase 1] Memulai pencarian berita terkini Mimika langsung dari internet...`);

    // 1. Ambil berita real-time dari internet menggunakan searchService (Google News RSS)
    const liveArticles = await searchService.searchMimikaNews();

    if (liveArticles.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Gagal mengambil berita terkini dari internet. Silakan coba beberapa saat lagi.',
      });
    }

    // 2. Ambil acuan baseline (bisa dari request body kustom, pilihan database, atau seluruhnya di DB)
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

    // 3. Panggil AI Service untuk menyaring dan mencocokkan berita dengan baseline
    const newsReports = await aiService.evaluateNewsCredibility(liveArticles, baselines);

    console.log(`[Fase 1] AI menyaring ${newsReports.length} berita berpotensi kerusuhan dari ${liveArticles.length} total berita hasil pencarian.`);

    // 4. Simpan berita yang relevan saja ke database raw_articles
    const processedArticles = [];
    for (const report of newsReports) {
      // Ambil index artikel asli menggunakan temp ID dari AI
      const idx = parseInt(report.article_id, 10);
      if (isNaN(idx) || idx < 0 || idx >= liveArticles.length) {
        console.warn(`[Fase 1] Mengabaikan report dengan index tidak valid: ${report.article_id}`);
        continue;
      }

      const originalArticle = liveArticles[idx];

      // Periksa duplikasi judul berita di database untuk menghindari duplikasi record
      let dbArticle = await prisma.rawArticle.findFirst({
        where: { title: originalArticle.title }
      });

      if (!dbArticle) {
        // Masukkan artikel baru yang lolos penyaringan EWS
        dbArticle = await prisma.rawArticle.create({
          data: {
            title: originalArticle.title,
            sourceName: originalArticle.sourceName,
            sourceType: originalArticle.sourceType,
            url: originalArticle.url,
            content: originalArticle.content,
            publishedAt: originalArticle.publishedAt,
            credibilityScore: 100.0,
            triangulationGroup: report.triangulation_group,
            credibilityFactors: {
              content: report.content,
              source: report.source,
              url: report.url,
              potentialChaosExplanation: report.potential_chaos_explanation,
              supportingSources: report.supporting_sources,
              isRelevantToEws: true
            }
          }
        });
      } else {
        // Jika sudah ada, update parameter EWS terbarunya
        dbArticle = await prisma.rawArticle.update({
          where: { id: dbArticle.id },
          data: {
            credibilityScore: 100.0,
            triangulationGroup: report.triangulation_group,
            credibilityFactors: {
              content: report.content,
              source: report.source,
              url: report.url,
              potentialChaosExplanation: report.potential_chaos_explanation,
              supportingSources: report.supporting_sources,
              isRelevantToEws: true
            }
          }
        });
      }

      processedArticles.push(dbArticle);
    }

    return res.status(200).json({
      success: true,
      message: `Penyaringan berita selesai. Ditemukan ${processedArticles.length} berita berpotensi kerusuhan.`,
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

    if (!triangulationGroup) {
      return res.status(400).json({
        success: false,
        message: 'Parameter triangulationGroup wajib disertakan.',
      });
    }

    console.log(`[Fase 2] Mengambil berita terverifikasi untuk kelompok isu: "${triangulationGroup}"...`);

    // Ambil berita yang berada dalam triangulationGroup tersebut
    const credibleArticles = await prisma.rawArticle.findMany({
      where: {
        triangulationGroup: triangulationGroup,
        credibilityScore: {
          gte: 50.0 // Hanya berita valid/lolos EWS
        }
      },
      orderBy: {
        createdAt: 'desc',
      }
    });

    if (credibleArticles.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Tidak menemukan berita terverifikasi untuk kelompok isu: "${triangulationGroup}". Pastikan isu sudah ditarik di Fase 1.`,
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

    // Simpan analisis awal ke database (belum memuat rekomendasi aksi & OPD)
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
        notes: `Membuat analisis dampak wilayah untuk kelompok isu "${triangulationGroup}". Risiko: ${analysis.risk_level}.`,
      }
    });

    return res.status(200).json({
      success: true,
      message: `Analisis dampak wilayah untuk kelompok isu "${triangulationGroup}" selesai dibuat.`,
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
