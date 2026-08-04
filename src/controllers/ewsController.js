import crypto from 'crypto';
import prisma from '../config/prisma.js';
import aiService from '../services/aiService.js';
import pdfService from '../services/pdfService.js';

/**
 * FASE 1: Menilai kredibilitas berita dan melakukan grup triangulasi
 * POST /api/v1/ews/process-news
 */
export const processNews = async (req, res) => {
  try {
    const { limit = 10 } = req.body;

    console.log(`[Fase 1] Mengambil ${limit} berita mentah teratas untuk penilaian kredibilitas...`);

    // Ambil berita terbaru (prioritaskan yang belum memiliki skor kredibilitas)
    let rawArticles = await prisma.rawArticle.findMany({
      where: {
        credibilityScore: null
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: parseInt(limit, 10),
    });

    // Jika yang belum diproses kosong, ambil berita terbaru secara umum untuk demo/testing
    if (rawArticles.length === 0) {
      console.log('[Fase 1] Semua berita sudah dinilai. Mengambil berita terbaru secara umum...');
      rawArticles = await prisma.rawArticle.findMany({
        orderBy: {
          createdAt: 'desc',
        },
        take: parseInt(limit, 10),
      });
    }

    if (rawArticles.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tidak ada berita mentah (raw_articles) di database. Hubungkan scraper Anda terlebih dahulu.',
      });
    }

    // Panggil AI untuk mengevaluasi kredibilitas berdasarkan formula
    const evaluations = await aiService.evaluateNewsCredibility(rawArticles);

    // Update masing-masing artikel di database
    const updatedArticles = [];
    for (const article of rawArticles) {
      // Cari apakah artikel ini masuk dalam evaluasi relevan oleh AI
      const evalData = evaluations.find(e => e.article_id === article.id);

      if (evalData) {
        // Jika relevan, hitung skor akhir menggunakan formula
        const S = evalData.source_reliability_score;
        const T = evalData.triangulation_score;
        const C = evalData.completeness_score;
        const score = (S * 0.4) + (T * 0.3) + (C * 0.3);

        const updated = await prisma.rawArticle.update({
          where: { id: article.id },
          data: {
            credibilityScore: parseFloat(score.toFixed(2)),
            triangulationGroup: evalData.triangulation_group,
            credibilityFactors: {
              sourceReliability: S,
              triangulation: T,
              completeness: C,
              reasoning: evalData.reasoning,
              supportingSources: evalData.supporting_sources,
              isRelevantToEws: true,
              potentialChaosDescription: evalData.potential_chaos_description
            }
          }
        });
        updatedArticles.push(updated);
      } else {
        // Jika tidak relevan dengan EWS, tandai dengan skor 0
        const updated = await prisma.rawArticle.update({
          where: { id: article.id },
          data: {
            credibilityScore: 0.0,
            triangulationGroup: 'Bukan Isu EWS',
            credibilityFactors: {
              sourceReliability: 0,
              triangulation: 0,
              completeness: 0,
              reasoning: 'AI mengklasifikasikan berita ini tidak memiliki potensi memicu kerusuhan masyarakat atau konflik ulayat/RKPD.',
              supportingSources: [],
              isRelevantToEws: false,
              potentialChaosDescription: 'Isu ini tidak membahayakan stabilitas wilayah Kabupaten Mimika.'
            }
          }
        });
        updatedArticles.push(updated);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Penilaian kredibilitas berita dan triangulasi selesai.',
      data: updatedArticles
    });
  } catch (error) {
    console.error('Error in processNews controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal memproses kredibilitas berita.',
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
    // Hanya ambil berita dengan kredibilitas tinggi (Skor >= 50)
    const { minCredibility = 50, limit = 10 } = req.body;

    console.log(`[Fase 2] Mengambil berita dengan kredibilitas >= ${minCredibility} untuk analisis dampak...`);

    const scoredArticles = await prisma.rawArticle.findMany({
      where: {
        credibilityScore: {
          gte: parseFloat(minCredibility)
        }
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: parseInt(limit, 10) * 3, // Mengambil lebih banyak untuk kompensasi penyaringan relevansi
    });

    // Saring hanya artikel yang ditandai RELEVAN dengan EWS (isRelevantToEws === true)
    const credibleArticles = scoredArticles
      .filter(a => {
        const factors = a.credibilityFactors;
        return factors && factors.isRelevantToEws === true;
      })
      .slice(0, parseInt(limit, 10));

    if (credibleArticles.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Tidak menemukan berita kredibel dan relevan EWS dengan skor >= ${minCredibility}. Jalankan Fase 1 terlebih dahulu atau pastikan ada isu potensial keamanan.`,
      });
    }

    // Ambil baseline RKPD/Pemerintah Mimika terbaru
    const baselines = await prisma.systemBaseline.findMany();

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
        notes: `Membuat analisis dampak wilayah untuk batch ${batchId}. Risiko: ${analysis.risk_level}.`,
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
