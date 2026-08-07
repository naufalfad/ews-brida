
/**
 * Service to integrate Apify actors for searching Facebook, Instagram, Threads, and X (Twitter)
 */
class ApifyService {
  /**
   * Searches social media posts using Apify API for a specific search query
   * @param {string} query - The search query term
   * @returns {Promise<Array>} - Unified list of social media post objects
   */
  async searchSocialMedia(query) {
    const apiKey = process.env.APIFY_API_KEY;
    if (!apiKey) {
      console.warn('[ApifyService] APIFY_API_KEY tidak dikonfigurasi. Melewati pencarian sosial media.');
      return [];
    }

    console.log(`[ApifyService] Memulai pencarian sosial media untuk kueri: "${query}"...`);
    const results = [];

    try {
      // Jalankan Twitter Scraper & Google Social Scraper secara paralel untuk mempercepat respons
      const [tweets, googleSosmed] = await Promise.all([
        this.searchTweets(query, apiKey),
        this.searchGoogleSosmed(query, apiKey)
      ]);

      results.push(...tweets);
      results.push(...googleSosmed);

      console.log(`[ApifyService] Berhasil mengambil ${results.length} postingan sosial media dari Apify.`);
    } catch (err) {
      console.error('[ApifyService] Gagal memproses pencarian sosial media:', err.message);
    }

    return results;
  }

  /**
   * Scrapes tweets from Twitter/X using apidojo/tweet-scraper
   */
  async searchTweets(query, apiKey) {
    try {
      const url = `https://api.apify.com/v2/acts/apidojo~tweet-scraper/run-sync-get-dataset-items?token=${apiKey}`;

      console.log(`[ApifyService] Mengirim kueri X/Twitter ke apidojo/tweet-scraper: "${query}"...`);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchTerms: [query],
          maxItems: 5,
          tweetsSearchMode: 'Latest',
          onlyTweets: true
        })
      });

      if (!response.ok) {
        console.warn(`[ApifyService] Twitter scraper gagal: ${response.statusText}`);
        return [];
      }

      const items = await response.json();
      if (!Array.isArray(items)) return [];

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const mappedTweets = items.map(item => ({
        title: `Postingan X/Twitter oleh @${item.twitter_user?.username || 'user'}`,
        content: item.text || item.full_text || '',
        sourceName: 'X (Twitter)',
        sourceType: 'Sosmed',
        url: item.url || `https://x.com/user/status/${item.id}`,
        publishedAt: item.created_at ? new Date(item.created_at) : new Date()
      }));

      // Filter agar hanya menyisakan postingan 7 hari terakhir
      return mappedTweets.filter(tweet => tweet.publishedAt >= sevenDaysAgo);
    } catch (err) {
      console.error('[ApifyService] Error scraping Twitter/X:', err.message);
      return [];
    }
  }

  /**
   * Searches public Facebook, Instagram, and Threads posts using Google Search Scraper on Apify
   */
  async searchGoogleSosmed(query, apiKey) {
    try {
      const searchUrl = `site:facebook.com OR site:instagram.com OR site:threads.net ${query}`;
      const url = `https://api.apify.com/v2/acts/apify~google-search-scraper/run-sync-get-dataset-items?token=${apiKey}`;

      console.log(`[ApifyService] Mengirim kueri FB/IG/Threads ke apify/google-search-scraper: "${searchUrl}"...`);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: searchUrl,
          maxPagesPerQuery: 1,
          resultsPerPage: 5,
          timePeriod: 'Week' // Membatasi Google Search hanya mengembalikan hasil index 7 hari terakhir
        })
      });

      if (!response.ok) {
        console.warn(`[ApifyService] Google Sosmed scraper gagal: ${response.statusText}`);
        return [];
      }

      const items = await response.json();
      if (!Array.isArray(items)) return [];

      const results = [];
      items.forEach(item => {
        if (item.organicResults && Array.isArray(item.organicResults)) {
          item.organicResults.forEach(res => {
            let sourceName = 'Sosial Media';
            const lowercaseUrl = (res.url || '').toLowerCase();
            if (lowercaseUrl.includes('facebook.com')) {
              sourceName = 'Facebook';
            } else if (lowercaseUrl.includes('instagram.com')) {
              sourceName = 'Instagram';
            } else if (lowercaseUrl.includes('threads.net')) {
              sourceName = 'Threads';
            }

            results.push({
              title: res.title || `Postingan di ${sourceName}`,
              content: res.description || res.title || '',
              sourceName: sourceName,
              sourceType: 'Sosmed',
              url: res.url,
              publishedAt: new Date()
            });
          });
        }
      });

      return results;
    } catch (err) {
      console.error('[ApifyService] Error scraping Google Sosmed:', err.message);
      return [];
    }
  }
}

export default new ApifyService();
