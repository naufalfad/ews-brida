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
