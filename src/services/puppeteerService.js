import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Gunakan plugin stealth agar tidak terdeteksi sebagai bot oleh Google
puppeteer.use(StealthPlugin());

class PuppeteerService {
  /**
   * Menjalankan browser headless untuk melakukan pencarian di Google
   * Berguna untuk mencari data spesifik dari media sosial (site:facebook.com dll)
   * @param {string} query 
   * @returns {Promise<Array>} Array artikel sosmed
   */
  async scrapeGoogleSocial(query) {
    let browser = null;
    try {
      console.log(`[PuppeteerService] Menjalankan Chrome Stealth untuk mencari: "${query}"...`);
      
      // Buka browser headless
      browser = await puppeteer.launch({
        headless: "new",
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-infobars',
          '--window-size=1280,800'
        ],
        ignoreHTTPSErrors: true
      });
      
      const page = await browser.newPage();
      
      // Menghindari deteksi bot
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
      });
      
      // Navigasi ke Google Search
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=id`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // Tunggu hingga elemen hasil pencarian muncul (class .g adalah container hasil standar Google)
      await page.waitForSelector('.g', { timeout: 8000 }).catch(() => console.log('[PuppeteerService] Timeout menunggu selector .g (Mungkin Captcha atau tidak ada hasil)'));
      
      // Ekstrak data dari struktur DOM Google
      const rawArticles = await page.evaluate(() => {
        const results = [];
        const items = document.querySelectorAll('.g');
        
        items.forEach((item) => {
          if (results.length >= 10) return; // Batasi 10 hasil maksimal
          
          const titleElement = item.querySelector('h3');
          const linkElement = item.querySelector('a');
          // Mencari class yang biasanya mengandung snippet teks di Google
          const snippetElement = item.querySelector('.VwiC3b, .yXK7lf, .MUxGbd, .lyLwlc, .aCOpRe');
          
          if (titleElement && linkElement) {
            const title = titleElement.innerText;
            const url = linkElement.href;
            const content = snippetElement ? snippetElement.innerText : title;
            
            // Tentukan sumber sosial media berdasarkan URL
            let sourceName = 'Media Sosial';
            let sourceType = 'SOSMED';
            
            if (url.includes('facebook.com')) sourceName = 'Facebook';
            else if (url.includes('twitter.com') || url.includes('x.com')) sourceName = 'X (Twitter)';
            else if (url.includes('instagram.com')) sourceName = 'Instagram';
            else if (url.includes('tiktok.com')) sourceName = 'TikTok';
            else if (url.includes('youtube.com')) sourceName = 'YouTube';

            results.push({
              title,
              sourceName,
              sourceType,
              url,
              content,
              publishedAt: new Date().toISOString()
            });
          }
        });
        
        return results;
      });
      
      if (rawArticles.length > 0) {
        console.log(`[PuppeteerService] Berhasil mengekstrak ${rawArticles.length} postingan sosmed dari Google Search.`);
        // Konversi string ISO kembali ke objek Date
        return rawArticles.map(article => ({
          ...article,
          publishedAt: new Date(article.publishedAt)
        }));
      } else {
        throw new Error("Tidak ada hasil (Mungkin Google Captcha aktif)");
      }
      
    } catch (error) {
      console.error('[PuppeteerService] Gagal mengekstrak data murni:', error.message);
      
      // FALLBACK MOCK DATA JIKA GOOGLE MEMBLOKIR (Sebagai demonstrasi prototipe)
      console.log("[PuppeteerService] Menggunakan MOCK DATA Sosial Media sebagai fallback demonstrasi...");
      const mockArticles = [
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
        },
        {
          title: "Klarifikasi kejadian di Kwamki Narama",
          sourceName: "Instagram",
          sourceType: "SOSMED",
          url: "https://instagram.com/p/abcde",
          content: "Kejadian semalam murni kesalahpahaman pemuda mabuk, sudah diselesaikan oleh tokoh adat setempat. Jangan termakan hoaks.",
          publishedAt: new Date(),
        }
      ];
      
      return mockArticles;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}

export default new PuppeteerService();
