import prisma from '../config/prisma.js';
import aiService from '../services/aiService.js';
import searchService from '../services/searchService.js';
import apifyService from '../services/apifyService.js';
import baselineService from '../services/baselineService.js';

// Helper to fetch and extract clean text from a URL
const fetchTextFromUrl = async (url) => {
  try {
    console.log(`[EwsController] Scraping link referensi: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!response.ok) return '';
    const html = await response.text();
    const cleanText = html
      .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
      .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleanText.substring(0, 4000); // Limit to first 4000 chars to save tokens
  } catch (err) {
    console.error(`[EwsController] Gagal scrape link ${url}:`, err.message);
    return '';
  }
};

/**
 * TAHAP 1: Mencari dan menyaring isu berdasarkan baseline daerah
 * POST /api/v1/ews/search-issues
 */
export const searchIssues = async (req, res) => {
  try {
    const { query } = req.body;
    let linksInput = req.body.links;

    // Normalisasi input links jika dikirim dalam berbagai format
    let links = [];
    if (linksInput) {
      if (Array.isArray(linksInput)) {
        links = linksInput;
      } else if (typeof linksInput === 'string') {
        try {
          // Coba parse jika dikirim sebagai string array JSON (mis. '["http://link1.com"]')
          const parsed = JSON.parse(linksInput);
          if (Array.isArray(parsed)) {
            links = parsed;
          } else {
            links = [linksInput];
          }
        } catch {
          // Jika gagal parse JSON, pisahkan berdasarkan koma
          links = linksInput.split(',').map(l => l.trim()).filter(Boolean);
        }
      }
    }

    const hasQuery = query && query.trim().length > 0;
    const hasFiles = req.files && req.files.length > 0;
    const hasLinks = links.length > 0;

    if (!hasQuery && !hasFiles && !hasLinks) {
      return res.status(400).json({
        success: false,
        message: 'Harap sertakan parameter "query", upload "files" (gambar/txt/pdf), atau sertakan tautan "links" referensi berita.'
      });
    }

    console.log(`[EwsController] Memulai pencarian EWS. Query: ${hasQuery ? 'Ya' : 'Tidak'}, Files Count: ${req.files ? req.files.length : 0}, Links Count: ${links.length}`);

    // 1. Ekstrak teks dari file yang diupload secara paralel
    let combinedFileText = '';
    if (hasFiles) {
      const fileTexts = await Promise.all(
        req.files.map(file => baselineService.extractTextFromFile(file))
      );
      combinedFileText = fileTexts.join('\n\n');
    }

    // 2. Ekstrak teks dari link referensi secara paralel
    let combinedLinkText = '';
    if (hasLinks) {
      const linkTexts = await Promise.all(
        links.map(link => fetchTextFromUrl(link))
      );
      combinedLinkText = linkTexts.join('\n\n');
    }

    // 3. Bangun kueri pencarian secara bersih dan langsung
    let searchQuery = 'mimika';
    if (query && query.trim().length > 0) {
      searchQuery = `mimika (${query.trim()})`;
    } else if (combinedFileText || combinedLinkText) {
      // Jika kueri kosong tetapi ada dokumen pendukung, minta AI merumuskan kueri pencarian optimal
      searchQuery = await aiService.expandSearchQuery(
        '',
        combinedFileText,
        combinedLinkText
      );
    }

    // 4. Cari berita terkait dari internet (Google News RSS & Apify Social Media) secara paralel
    const cleanSocialQuery = query && query.trim().length > 0 ? query.trim() : searchQuery;
    const [liveNews, socialPosts] = await Promise.all([
      searchService.searchMimikaNews(searchQuery),
      apifyService.searchSocialMedia(cleanSocialQuery)
    ]);

    const liveArticles = [...liveNews, ...socialPosts];

    if (liveArticles.length === 0) {
      return res.status(200).json({
        success: true,
        message: `Tidak ditemukan berita terkini untuk kueri "${searchQuery}" di internet maupun sosial media dalam 24 jam terakhir.`,
        timeframe: '24 jam terakhir',
        data: []
      });
    }

    // 5. Pra-penyaringan: Eliminasi berita yang URL-nya sudah pernah diproses/terdaftar di database
    const existingIssues = await prisma.ewsIssue.findMany({
      select: {
        sourceUrl: true,
        sources: true
      }
    });

    const existingUrls = new Set();
    existingIssues.forEach(issue => {
      if (issue.sourceUrl) {
        existingUrls.add(issue.sourceUrl.trim().toLowerCase());
      }
      if (issue.sources && Array.isArray(issue.sources)) {
        issue.sources.forEach(src => {
          if (src.url) {
            existingUrls.add(src.url.trim().toLowerCase());
          }
        });
      }
    });

    const newArticles = liveArticles.filter(art => !existingUrls.has(art.url.trim().toLowerCase()));

    if (newArticles.length === 0) {
      console.log(`[EwsController] 0 berita baru terdeteksi. Semua ${liveArticles.length} berita dari internet sudah pernah di-ingest sebelumnya.`);
      
      // Ambil isu lama yang relevan dari database agar pengguna tetap dapat melihat datanya
      let matchingDbIssues = [];
      if (query && query.trim().length > 0) {
        matchingDbIssues = await prisma.ewsIssue.findMany({
          where: {
            OR: [
              { title: { contains: query.trim(), mode: 'insensitive' } },
              { description: { contains: query.trim(), mode: 'insensitive' } }
            ]
          },
          orderBy: { createdAt: 'desc' }
        });
      } else {
        matchingDbIssues = await prisma.ewsIssue.findMany({
          where: {
            createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
          },
          orderBy: { createdAt: 'desc' }
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Seluruh berita yang ditemukan sudah pernah diproses sebelumnya. Menampilkan data relevan dari database.',
        timeframe: '7 hari terakhir',
        data: matchingDbIssues
      });
    }

    console.log(`[EwsController] Menemukan ${newArticles.length} berita baru dari total ${liveArticles.length} berita untuk dianalisis AI.`);

    // 6. Ambil acuan baseline dan isu-isu aktif (7 hari terakhir) sebagai konteks deduplikasi semantik
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [baselines, activeDbIssues] = await Promise.all([
      prisma.systemBaseline.findMany(),
      prisma.ewsIssue.findMany({
        where: { createdAt: { gte: sevenDaysAgo } }
      })
    ]);

    if (baselines.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'Data baseline sistem kosong di database. Harap jalankan seeder terlebih dahulu.'
      });
    }

    // 7. Hubungi AI untuk menyaring berita-berita baru terhadap baseline dengan membandingkan isu di DB
    const filteredIssues = await aiService.filterIssuesAgainstBaselines(
      newArticles,
      baselines,
      query || '',
      activeDbIssues
    );

    const savedIssues = [];

    // 8. Simpan/Gabungkan hasil saringan isu ke database secara akumulatif
    for (const issue of filteredIssues) {
      // Cari apakah isu dengan judul yang sama persis sudah ada di database
      let dbIssue = await prisma.ewsIssue.findFirst({
        where: { title: issue.title }
      });

      if (!dbIssue) {
        // Jika belum ada, buat entri isu baru
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
        // Jika sudah ada, gabungkan daftar media (sources) secara unik (deduplikasi URL case-insensitive)
        const existingSources = Array.isArray(dbIssue.sources) ? dbIssue.sources : [];
        const newSources = Array.isArray(issue.sources) ? issue.sources : [];
        const mergedSources = [...existingSources];

        newSources.forEach(newSrc => {
          const exists = mergedSources.some(oldSrc => 
            (oldSrc.url || '').trim().toLowerCase() === (newSrc.url || '').trim().toLowerCase()
          );
          if (!exists) {
            mergedSources.push(newSrc);
          }
        });

        dbIssue = await prisma.ewsIssue.update({
          where: { id: dbIssue.id },
          data: {
            description: issue.description,
            sources: mergedSources,
            sourceName: issue.source_name,
            sourceUrl: issue.source_url
          }
        });
      }
      savedIssues.push(dbIssue);
    }

    // 9. Cari isu lama terkait dari database untuk memperkaya hasil pengembalian
    let matchingDbIssues = [];
    if (query && query.trim().length > 0) {
      matchingDbIssues = await prisma.ewsIssue.findMany({
        where: {
          OR: [
            { title: { contains: query.trim(), mode: 'insensitive' } },
            { description: { contains: query.trim(), mode: 'insensitive' } }
          ],
          createdAt: { gte: sevenDaysAgo }
        },
        orderBy: { createdAt: 'desc' }
      });
    }

    // Gabungkan hasil baru/update dengan isu lama secara unik berdasarkan ID
    const uniqueIssuesMap = new Map();
    savedIssues.forEach(issue => uniqueIssuesMap.set(issue.id, issue));
    matchingDbIssues.forEach(issue => {
      if (!uniqueIssuesMap.has(issue.id)) {
        uniqueIssuesMap.set(issue.id, issue);
      }
    });
    
    const finalResponseData = Array.from(uniqueIssuesMap.values());

    // 10. Buat entri Audit Log pencarian
    const logQuery = query || (req.files && req.files.length > 0 ? '[File Upload]' : '') || (links && links.length > 0 ? '[Link Referensi]' : '') || 'Umum';
    await prisma.auditLog.create({
      data: {
        userId: req.headers['x-user-id'] || 'KEPALA_BRIDA',
        actionType: 'SEARCH_ISSUES',
        notes: `Melakukan pencarian EWS dengan kueri: "${logQuery}". Menyimpan/menggabungkan ${savedIssues.length} isu potensial.`
      }
    });

    const displayMsg = filteredIssues.length > 0
      ? `Pencarian selesai. Ditemukan ${savedIssues.length} isu potensial (baru/diperbarui) dari internet.`
      : `Pencarian selesai. Tidak ada berita baru yang menyimpang dari baseline. Menampilkan data historis.`;

    return res.status(200).json({
      success: true,
      message: displayMsg,
      timeframe: '7 hari terakhir',
      data: finalResponseData
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
