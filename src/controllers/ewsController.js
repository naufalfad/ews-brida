import crypto from 'crypto';
import prisma from '../config/prisma.js';
import aiService from '../services/aiService.js';
import pdfService from '../services/pdfService.js';
import searchService from '../services/searchService.js';
import baselineService from '../services/baselineService.js';
import { assembleContextForTriangulation } from '../services/context-assembly.service.js';

/**
 * Controller Tahap 1: Ingest & Filter Raw News
 */
export async function ingestNews(req, res) {
  try {
    console.log('[Tahap 0] Memulai alur Ingestion & Database Persistence...');

    // 1. Ambil Data Baseline acuan
    let baselines = [];
    if (baselineService && baselineService.getBaselines) {
      baselines = await baselineService.getBaselines();
    } else {
      baselines = await prisma.systemBaseline.findMany();
    }

    // 2. AI menghasilkan kata kunci pencarian (Fase 0)
    const queries = await aiService.generateSearchQueries(baselines);
    console.log(`[Tahap 0] Generated Queries (${queries.length}):`, queries);

    // 3. Ambil berita real-time via search service
    const rawArticles = await searchService.executeBatchSearch(queries);
    console.log(`[Tahap 0] Total Berita Unik Ditemukan: ${rawArticles.length}`);

    if (rawArticles.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Ingestion selesai, namun tidak ada berita baru yang ditemukan hari ini.',
        data: { generatedQueries: queries, totalSaved: 0, articles: [] }
      });
    }

    // 4. SIMPAN KE DATABASE PRISMA (Tabel RawArticle)
    // Gunakan transaction/upsert agar jika URL sudah ada, data tidak crash/duplikat
    const savedArticles = [];
    for (const article of rawArticles) {
      const savedItem = await prisma.rawArticle.upsert({
        where: { url: article.url },
        update: {
          title: article.title,
          content: article.content,
          sourceName: article.sourceName
        },
        create: {
          title: article.title,
          content: article.content,
          sourceName: article.sourceName,
          sourceType: article.sourceType,
          url: article.url,
          publishedAt: new Date()
        }
      });
      savedArticles.push(savedItem);
    }

    console.log(`[Tahap 0] Berhasil menyimpan ${savedArticles.length} berita ke database!`);

    return res.status(200).json({
      success: true,
      message: `Tahap 0 Berhasil: ${savedArticles.length} berita berhasil dikumpulkan dan disimpan ke database.`,
      data: {
        generatedQueries: queries,
        totalSaved: savedArticles.length,
        articles: savedArticles
      }
    });
  } catch (error) {
    console.error('Error in ingestNews:', error);
    return res.status(500).json({
      success: false,
      error: `Gagal menjalankan Ingestion Tahap 0: ${error.message}`
    });
  }
}

/**
 * Controller Tahap 1: Triangulasi & Fact-Checking Isu
 * POST /api/v1/ews/triangulate-news
 */
export async function triangulateNews(req, res) {
  try {
    console.log('[Tahap 1] Memulai proses Triangulasi & Fact-Checking...');

    // 1. Ambil artikel mentah DB dan data baseline RAG Context
    const { rawArticles, baselines } = await assembleContextForTriangulation();

    if (!rawArticles || rawArticles.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Tidak ada berita mentah di database untuk ditriangulasi. Jalankan Tahap 0 terlebih dahulu.',
        data: []
      });
    }

    // 2. Jalankan Triangulasi AI via OpenAI Structured Output
    const verifiedReports = await aiService.evaluateNewsCredibility(rawArticles, baselines);
    console.log(`[Tahap 1] Berhasil memvalidasi ${verifiedReports.length} laporan.`);

    // 3. SIMPAN HASIL TRIANGULASI KE DATABASE PRISMA (Tabel TriangulationResult)
    const savedTriangulations = [];
    for (const report of verifiedReports) {
      const savedItem = await prisma.triangulationResult.upsert({
        where: { url: report.url },
        update: {
          title: report.title,
          category: report.category,
          validationStatus: report.validation_status,
          credibilityScore: report.credibility_score,
          riskLevel: report.risk_level,
          sourceName: report.source_name,
          factualComparison: report.factual_comparison,
          aiReasoning: report.ai_reasoning,
          triangulationGroup: report.triangulation_group,
          updatedAt: new Date()
        },
        create: {
          title: report.title,
          category: report.category,
          validationStatus: report.validation_status,
          credibilityScore: report.credibility_score,
          riskLevel: report.risk_level,
          sourceName: report.source_name,
          url: report.url,
          factualComparison: report.factual_comparison,
          aiReasoning: report.ai_reasoning,
          triangulationGroup: report.triangulation_group
        }
      });
      savedTriangulations.push(savedItem);
    }

    return res.status(200).json({
      success: true,
      message: `Tahap 1 Berhasil: ${savedTriangulations.length} laporan berhasil ditriangulasi dan disimpan ke database.`,
      data: savedTriangulations
    });
  } catch (error) {
    console.error('Error in triangulateNews:', error);
    return res.status(500).json({
      success: false,
      error: `Gagal menjalankan Triangulasi Tahap 1: ${error.message}`
    });
  }
}

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
