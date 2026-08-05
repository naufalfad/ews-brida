import prisma from '../config/prisma.js';
import aiService from '../services/aiService.js';
import searchService from '../services/searchService.js';

/**
 * TAHAP 1: Mencari dan menyaring isu berdasarkan baseline daerah
 * POST /api/v1/ews/search-issues
 */
export const searchIssues = async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Parameter "query" wajib disertakan. Berikan topik isu yang ingin dicari.'
      });
    }

    console.log(`[EwsController] Memulai pencarian EWS untuk kueri user: "${query}"`);

    // 1. Ekspansi kueri pencarian menggunakan AI agar lebih relevan dengan Google News Mimika
    const expandedQuery = await aiService.expandSearchQuery(query);

    // 2. Cari berita terkait dari internet (Google News RSS)
    const liveArticles = await searchService.searchMimikaNews(expandedQuery);

    if (liveArticles.length === 0) {
      return res.status(200).json({
        success: true,
        message: `Tidak ditemukan berita terkini untuk kueri "${expandedQuery}" di internet.`,
        timeframe: 'none',
        data: []
      });
    }

    // 3. Tarik seluruh system baseline dari database
    const baselines = await prisma.systemBaseline.findMany();

    if (baselines.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'Data baseline sistem kosong di database. Harap jalankan seeder terlebih dahulu.'
      });
    }

    // 4. Hubungi AI untuk menyaring seluruh berita 7 hari terakhir terhadap baseline
    const filteredIssues = await aiService.filterIssuesAgainstBaselines(liveArticles, baselines);

    const savedIssues = [];

    // 5. Simpan hasil saringan isu ke database dengan status 'DRAFT_SEARCHED'
    for (const issue of filteredIssues) {
      // Cek duplikasi judul agar tidak menyimpan isu yang sama berulang kali
      let dbIssue = await prisma.ewsIssue.findFirst({
        where: { title: issue.title }
      });

      if (!dbIssue) {
        dbIssue = await prisma.ewsIssue.create({
          data: {
            title: issue.title,
            description: issue.description,
            sourceName: issue.source_name,
            sourceUrl: issue.source_url,
            sources: issue.sources,
            status: 'DRAFT_SEARCHED'
          }
        });
      } else {
        // Jika sudah ada, perbarui deskripsi dan daftar sumber pendukung terbaru
        dbIssue = await prisma.ewsIssue.update({
          where: { id: dbIssue.id },
          data: {
            description: issue.description,
            sources: issue.sources,
            sourceName: issue.source_name,
            sourceUrl: issue.source_url
          }
        });
      }
      savedIssues.push(dbIssue);
    }

    // 6. Buat entri Audit Log pencarian
    await prisma.auditLog.create({
      data: {
        userId: req.headers['x-user-id'] || 'KEPALA_BRIDA',
        actionType: 'SEARCH_ISSUES',
        notes: `Melakukan pencarian isu EWS 7 hari terakhir dengan kata kunci: "${query}". Ditemukan ${savedIssues.length} isu potensial.`
      }
    });

    const displayMsg = filteredIssues.length > 0
      ? `Pencarian selesai. Ditemukan ${savedIssues.length} isu potensial yang menyimpang dari baseline.`
      : `Pencarian selesai. Tidak ada isu potensial yang menyimpang dari baseline.`;

    return res.status(200).json({
      success: true,
      message: displayMsg,
      timeframe: '7 hari terakhir',
      data: savedIssues
    });

  } catch (error) {
    console.error('Error in searchIssues controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal memproses pencarian dan penyaringan isu.',
      error: error.message
    });
  }
};

/**
 * Mendapatkan riwayat seluruh Isu EWS
 * GET /api/v1/ews/issues
 */
export const getIssues = async (req, res) => {
  try {
    const issues = await prisma.ewsIssue.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        AuditLogs: true
      }
    });

    return res.status(200).json({
      success: true,
      data: issues
    });
  } catch (error) {
    console.error('Error in getIssues controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil riwayat isu.',
      error: error.message
    });
  }
};

/**
 * TAHAP 2: Evaluasi Kredibilitas & Cek Hoax
 * POST /api/v1/ews/issues/:id/verify
 */
export const verifyIssue = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Cek keberadaan isu di database
    const issue = await prisma.ewsIssue.findUnique({
      where: { id }
    });

    if (!issue) {
      return res.status(404).json({
        success: false,
        message: `Isu dengan ID ${id} tidak ditemukan.`
      });
    }

    // 2. Batasi agar hanya isu berstatus DRAFT_SEARCHED yang bisa diverifikasi
    if (issue.status !== 'DRAFT_SEARCHED') {
      return res.status(400).json({
        success: false,
        message: `Isu ini sudah diverifikasi sebelumnya. Status saat ini: ${issue.status}`
      });
    }

    // 3. Panggil AI Service untuk memeriksa hoax
    const checkResult = await aiService.checkHoaxCredibility(id);

    // 4. Tentukan status tujuan verifikasi
    const targetStatus = checkResult.is_hoax ? 'VERIFIED_HOAX' : 'VERIFIED_CREDIBLE';

    // 5. Update data isu di database
    const updatedIssue = await prisma.ewsIssue.update({
      where: { id },
      data: {
        isHoax: checkResult.is_hoax,
        verificationScore: checkResult.verification_score,
        verificationNotes: checkResult.verification_notes,
        status: targetStatus
      }
    });

    // 6. Buat entri Audit Log
    await prisma.auditLog.create({
      data: {
        userId: req.headers['x-user-id'] || 'KEPALA_BRIDA',
        actionType: 'VERIFY_ISSUE',
        issueId: id,
        notes: `Melakukan evaluasi kredibilitas isu "${issue.title}". Hasil: ${checkResult.is_hoax ? 'HOAX' : 'KREDIBEL'} (Skor: ${checkResult.verification_score}).`
      }
    });

    return res.status(200).json({
      success: true,
      message: `Evaluasi kredibilitas selesai. Isu dinyatakan sebagai ${checkResult.is_hoax ? 'HOAX' : 'KREDIBEL'}.`,
      data: updatedIssue
    });

  } catch (error) {
    console.error('Error in verifyIssue controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal memproses evaluasi kredibilitas isu.',
      error: error.message
    });
  }
};

/**
 * TAHAP 3: Analisis Mendalam Dampak Isu
 * POST /api/v1/ews/issues/:id/analyze
 */
export const analyzeIssue = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Cek keberadaan isu di database
    const issue = await prisma.ewsIssue.findUnique({
      where: { id }
    });

    if (!issue) {
      return res.status(404).json({
        success: false,
        message: `Isu dengan ID ${id} tidak ditemukan.`
      });
    }

    // 2. Batasi agar hanya isu berstatus VERIFIED_CREDIBLE yang bisa dianalisis mendalam
    if (issue.status !== 'VERIFIED_CREDIBLE') {
      return res.status(400).json({
        success: false,
        message: `Hanya isu dengan status VERIFIED_CREDIBLE yang dapat dianalisis dampaknya. Status saat ini: ${issue.status}`
      });
    }

    // 3. Panggil AI Service untuk analisis mendalam
    const analysisResult = await aiService.analyzeDeepImpact(id);

    // 4. Update data isu di database
    const updatedIssue = await prisma.ewsIssue.update({
      where: { id },
      data: {
        riskLevel: analysisResult.risk_level,
        primaryCategory: analysisResult.primary_category,
        targetDistrict: analysisResult.target_district,
        analysisSummary: analysisResult.analysis_summary,
        predictedImpact: analysisResult.predicted_impact,
        status: 'ANALYZED'
      }
    });

    // 5. Buat entri Audit Log
    await prisma.auditLog.create({
      data: {
        userId: req.headers['x-user-id'] || 'KEPALA_BRIDA',
        actionType: 'ANALYZE_ISSUE',
        issueId: id,
        notes: `Melakukan analisis mendalam isu "${issue.title}". Hasil -> Risiko: ${analysisResult.risk_level}, Kategori: ${analysisResult.primary_category}, Distrik: ${analysisResult.target_district}.`
      }
    });

    return res.status(200).json({
      success: true,
      message: `Analisis mendalam dampak isu selesai.`,
      data: updatedIssue
    });

  } catch (error) {
    console.error('Error in analyzeIssue controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal memproses analisis mendalam dampak isu.',
      error: error.message
    });
  }
};

/**
 * TAHAP 4: Mitigasi & Rekomendasi OPD
 * POST /api/v1/ews/issues/:id/mitigate
 */
export const mitigateIssue = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Cek keberadaan isu di database
    const issue = await prisma.ewsIssue.findUnique({
      where: { id }
    });

    if (!issue) {
      return res.status(404).json({
        success: false,
        message: `Isu dengan ID ${id} tidak ditemukan.`
      });
    }

    // 2. Batasi agar hanya isu berstatus ANALYZED yang bisa dimitigasi
    if (issue.status !== 'ANALYZED') {
      return res.status(400).json({
        success: false,
        message: `Hanya isu dengan status ANALYZED yang dapat dirancang mitigasinya. Status saat ini: ${issue.status}`
      });
    }

    // 3. Panggil AI Service untuk menyusun mitigasi & rekomendasi OPD
    const mitigationResult = await aiService.generateMitigationRecommendations(id);

    // 4. Update data isu di database
    const updatedIssue = await prisma.ewsIssue.update({
      where: { id },
      data: {
        mitigationActions: mitigationResult.mitigation_actions,
        responsibleOpd: mitigationResult.responsible_opd,
        status: 'MITIGATED'
      }
    });

    // 5. Buat entri Audit Log
    await prisma.auditLog.create({
      data: {
        userId: req.headers['x-user-id'] || 'KEPALA_BRIDA',
        actionType: 'MITIGATE_ISSUE',
        issueId: id,
        notes: `Merumuskan rekomendasi mitigasi untuk isu "${issue.title}". OPD Penanggung Jawab: ${mitigationResult.responsible_opd}.`
      }
    });

    return res.status(200).json({
      success: true,
      message: `Rencana mitigasi dan rekomendasi OPD berhasil dirumuskan.`,
      data: updatedIssue
    });

  } catch (error) {
    console.error('Error in mitigateIssue controller:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal merancang rencana mitigasi isu.',
      error: error.message
    });
  }
};
