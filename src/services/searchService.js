/**
 * Service to fetch real-time news about Mimika using Google News RSS Feed
 */
class SearchService {
  /**
   * Fetches the latest news articles from Google News RSS feed for the query "mimika" and optional sector
   * @param {string} sector - Optional sector to query (e.g. ekonomi, politik, infrastruktur)
   * @returns {Promise<Array>} - Array of parsed article objects
   */
  async searchMimikaNews(sector) {
    try {
      let query = 'mimika';
      if (sector && sector.trim().length > 0) {
        query = `mimika ${sector.trim()}`;
      }
      
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=id-ID&gl=ID&ceid=ID:id`;
      
      console.log(`[SearchService] Menghubungi Google News RSS untuk mencari isu terkini di "${query}"...`);
      
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
      const descriptionRegex = /<description>([\s\S]*?)<\/description>/;

      const articles = [];
      let match;
      
      // Limit to top 15 recent articles to prevent hitting token limits
      while ((match = itemRegex.exec(xml)) !== null && articles.length < 15) {
        const itemContent = match[1];
        const titleMatch = titleRegex.exec(itemContent);
        const linkMatch = linkRegex.exec(itemContent);
        const dateMatch = dateRegex.exec(itemContent);
        const sourceMatch = sourceRegex.exec(itemContent);
        const descriptionMatch = descriptionRegex.exec(itemContent);

        if (titleMatch && linkMatch) {
          const fullTitle = this.unescapeHtml(titleMatch[1].trim());
          const sourceName = sourceMatch ? this.unescapeHtml(sourceMatch[1].trim()) : 'Media Online';
          
          // Clean title (Google News appends " - Source Name" at the end of titles)
          let title = fullTitle;
          const suffix = ` - ${sourceName}`;
          if (fullTitle.endsWith(suffix)) {
            title = fullTitle.substring(0, fullTitle.length - suffix.length).trim();
          }

          let description = '';
          if (descriptionMatch) {
            // Strip HTML tags and clean double spaces
            description = this.unescapeHtml(
              descriptionMatch[1]
                .replace(/<[^>]*>?/gm, '')
                .replace(/\s+/g, ' ')
                .trim()
            );
          }

          const publishedAt = dateMatch ? new Date(dateMatch[1]) : new Date();
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          
          if (publishedAt >= oneDayAgo) {
            articles.push({
              title: title,
              sourceName: sourceName,
              sourceType: 'Media Online',
              url: linkMatch[1].trim(),
              content: description || title,
              publishedAt: publishedAt,
            });
          }
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
