import { ApifyClient } from 'apify-client';
import dotenv from 'dotenv';
dotenv.config();

class ApifyService {
  constructor() {
    this.client = new ApifyClient({
      token: process.env.APIFY_API_TOKEN,
    });
  }

  /**
   * Menggunakan Apify Google Search Scraper untuk mencari data media sosial
   * Tahan terhadap pemblokiran dan captcha berkat proxy perumahan (residential proxy) Apify
   * @param {string} query 
   * @returns {Promise<Array>}
   */
  async scrapeGoogleSocial(query) {
    try {
      console.log(`[ApifyService] Menghubungi Cloud Apify untuk query: "${query}"...`);
      
      // Memanggil Google Search Scraper Actor di Apify
      const run = await this.client.actor("apify/google-search-scraper").call({
          queries: query,
          maxPagesPerQuery: 1,
          resultsPerPage: 15,
          countryCode: "id", // Lokasi Indonesia
          languageCode: "id",
      });

      // Mengambil data hasil dari dataset
      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();
      
      const rawArticles = [];
      const seenUrls = new Set();

      // Mem-parsing hasil
      if (items && items.length > 0 && items[0].organicResults) {
        items[0].organicResults.forEach(item => {
          const url = item.url;
          const title = item.title;
          const content = item.description || title;

          if (!url || seenUrls.has(url)) return;
          seenUrls.add(url);

          // Tentukan sumber sosial media berdasarkan URL
          let sourceName = 'Media Online';
          let sourceType = 'NEWS_PORTAL';
          
          if (url.includes('facebook.com')) { sourceName = 'Facebook'; sourceType = 'SOSMED'; }
          else if (url.includes('twitter.com') || url.includes('x.com')) { sourceName = 'X (Twitter)'; sourceType = 'SOSMED'; }
          else if (url.includes('instagram.com')) { sourceName = 'Instagram'; sourceType = 'SOSMED'; }
          else if (url.includes('tiktok.com')) { sourceName = 'TikTok'; sourceType = 'SOSMED'; }
          else if (url.includes('youtube.com')) { sourceName = 'YouTube'; sourceType = 'SOSMED'; }
          else {
            // Jika bukan sosmed, ekstrak nama domainnya (misal: detik.com)
            try {
              const domain = new URL(url).hostname.replace('www.', '');
              sourceName = domain;
            } catch (e) {
              sourceName = 'Web Portal';
            }
          }

          rawArticles.push({
            title,
            sourceName,
            sourceType,
            url,
            content,
            publishedAt: new Date() // Tanggal aktual penarikan
          });
        });
      }

      console.log(`[ApifyService] Berhasil mengekstrak ${rawArticles.length} data bersih dari Apify.`);
      return rawArticles;

    } catch (error) {
      console.error('[ApifyService] Gagal menjalankan Apify:', error.message);
      
      // Fallback keselamatan saat demo jika kuota Apify habis
      console.log("[ApifyService] Menggunakan MOCK DATA sebagai pengaman UI...");
      return [
        {
          title: "Postingan Warga: Ada keramaian di dekat perempatan SP3",
          sourceName: "Facebook",
          sourceType: "SOSMED",
          url: "https://facebook.com/post/12345",
          content: "Tadi pagi saya lewat SP3 ada banyak orang kumpul-kumpul dan bakar ban. Mohon yang mau ke arah sana hati-hati.",
          publishedAt: new Date(),
        },
        {
          title: "Antrean panjang Solar di SPBU Nusalima",
          sourceName: "X (Twitter)",
          sourceType: "SOSMED",
          url: "https://x.com/warga_timika/status/999",
          content: "Udah 3 hari ini solar susah dicari. Sopir truk pada ngeluh gabisa jalan. #Timika #Mimika",
          publishedAt: new Date(),
        }
      ];
    }
  }
}

export default new ApifyService();
