import apifyService from './apifyService.js';

/**
 * Service to fetch real-time news about Mimika using Google News RSS Feed
 */
class SearchService {
  /**
   * Fetches the latest news articles from Google News RSS feed for the query "mimika"
   * @returns {Promise<Array>} - Array of parsed article objects
   */
  async searchMimikaNews() {
    try {
      return await this.fetchFromSearchEngine('mimika');
    } catch (error) {
      console.error('[SearchService] Gagal memproses live search berita:', error);
      return [];
    }
  }

  /**
   * Eksekusi batch search & hapus duplikasi URL
   * @param {Array<string>} queries 
   * @returns {Promise<Array>} Array artikel bersih tanpa duplikat
   */
  async executeBatchSearch(queries) {
    let rawArticles = [];
    const seenUrls = new Set();
    
    // KARENA INI UNTUK TESTING: Kita paksa injeksi query sosmed agar pasti dijalankan
    // tanpa bergantung sepenuhnya pada output AI yang mungkin tidak menyebut 'site:'
    if (!queries.some(q => q.includes('site:'))) {
      queries.push('site:facebook.com "mimika"');
    }

    for (const query of queries) {
      try {
        let results = [];
        // Jika query mengandung 'site:', gunakan Apify untuk mencari di Google Web
        if (query.includes('site:')) {
          results = await apifyService.scrapeGoogleSocial(query);
        } else {
          // Jika tidak, gunakan Google News RSS untuk media online
          results = await this.fetchFromSearchEngine(query); 
        }
        
        for (const item of results) {
          if (item.url && !seenUrls.has(item.url)) {
            seenUrls.add(item.url);
            rawArticles.push({
              title: item.title || 'Tanpa Judul',
              sourceName: item.sourceName || 'Media Online',
              sourceType: item.sourceType || 'NEWS_PORTAL',
              url: item.url,
              content: item.snippet || item.content || ''
            });
          }
        }
      } catch (err) {
        console.warn(`Error pencarian query: "${query}"`, err.message);
      }
    }

    // Filter ketat agar HANYA berita yang relevan dengan potensi konflik/keresahan yang lolos
    const filteredArticles = this.filterCriticalNews(rawArticles);
    console.log(`[SearchService] Hasil penyaringan ketat: ${filteredArticles.length} berita/sosmed kritis ditemukan dari ${rawArticles.length} total tangkapan.`);
    
    return filteredArticles;
  }

  /**
   * Menyaring artikel hanya untuk isu keamanan, keresahan, dan kelangkaan
   * @param {Array} articles 
   * @returns {Array}
   */
  filterCriticalNews(articles) {
    const criticalKeywords = [
      'kerusuhan', 'keresahan', 'demo ', 'demonstrasi', 'ricuh', 'bentrok', 
      'pemalangan', 'palang', 'blokir', 'mahal', 'langka', 'antre', 'antrean', 
      'mogok', 'protes', 'konflik', 'senjata', 'pembunuhan', 'penembakan', 
      'kkb', 'opm', 'siaga', 'waspada', 'sara', 'provokasi', 'unjuk rasa', 
      'tewas', 'luka', 'bakar', 'kamtibmas', 'bbm', 'beras'
    ];

    return articles.filter(article => {
      const textToSearch = (article.title + " " + article.content).toLowerCase();
      // Pastikan setidaknya satu kata kunci kritis ada di judul atau konten
      return criticalKeywords.some(keyword => textToSearch.includes(keyword));
    });
  }

  /**
   * Fetches the latest news articles from Google News RSS feed for a specific query
   * @param {string} query
   * @returns {Promise<Array>} - Array of parsed article objects
   */
  async fetchFromSearchEngine(query) {
    try {
      // Tambahkan 'when:1d' secara otomatis agar Google News HANYA mencari berita 24 jam terakhir (Hari Ini)
      const queryWithTime = query.includes('when:1d') ? query : `${query} when:1d`;
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(queryWithTime)}&hl=id-ID&gl=ID&ceid=ID:id`;
      
      console.log(`[SearchService] Menghubungi Google News RSS untuk mencari isu terkini di "${queryWithTime}"...`);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Gagal mengambil data RSS feed: ${response.statusText}`);
      }
      
      const xml = await response.text();
      
      // Regular expressions to extract XML elements
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      const titleRegex = /<title>([\s\S]*?)<\/title>/;
      const linkRegex = /<link>([\s\S]*?)<\/link>/;
      const dateRegex = /<pubDate>([\s\S]*?)<\/pubDate>/;
      const sourceRegex = /<source[^>]*?>([\s\S]*?)<\/source>/;

      const articles = [];
      let match;
      
      // Limit to top 15 recent articles to prevent hitting token limits
      while ((match = itemRegex.exec(xml)) !== null && articles.length < 15) {
        const itemContent = match[1];
        const titleMatch = titleRegex.exec(itemContent);
        const linkMatch = linkRegex.exec(itemContent);
        const dateMatch = dateRegex.exec(itemContent);
        const sourceMatch = sourceRegex.exec(itemContent);

        if (titleMatch && linkMatch) {
          const fullTitle = this.unescapeHtml(titleMatch[1].trim());
          const sourceName = sourceMatch ? this.unescapeHtml(sourceMatch[1].trim()) : 'Media Online';
          
          // Clean title (Google News appends " - Source Name" at the end of titles)
          let title = fullTitle;
          const suffix = ` - ${sourceName}`;
          if (fullTitle.endsWith(suffix)) {
            title = fullTitle.substring(0, fullTitle.length - suffix.length).trim();
          }

          articles.push({
            title: title,
            sourceName: sourceName,
            sourceType: 'Media Online',
            url: linkMatch[1].trim(),
            content: `Pemberitaan berjudul "${title}" dirilis oleh ${sourceName}. Lakukan analisis terhadap judul dan sumber berita ini apakah mengindikasikan tensi sosial, konflik, sengketa ulayat, demonstrasi, atau kelangkaan energi/pangan di Kabupaten Mimika Papua Tengah.`,
            publishedAt: dateMatch ? new Date(dateMatch[1]) : new Date(),
          });
        }
      }
      
      console.log(`[SearchService] Berhasil mengambil ${articles.length} berita dari internet.`);
      return articles;
    } catch (error) {
      console.error('[SearchService] Gagal memproses live search berita:', error);
      return []; // Return empty on error to prevent crashing the flow
    }
  }

  /**
   * Helper to unescape basic HTML entities
   */
  unescapeHtml(str) {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
}

export default new SearchService();
