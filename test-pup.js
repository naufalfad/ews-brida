import puppeteer from 'puppeteer';

async function test() {
  const query = 'site:facebook.com "mimika"';
  let browser = null;
  try {
    console.log(`Menjalankan Chrome headless untuk mencari: "${query}"...`);
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
    });
    
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Cetak HTML
    const html = await page.content();
    console.log("HTML length:", html.length);
    
    const hasResults = html.includes('b_algo');
    console.log("Has results?", hasResults);
    
  } catch(e) {
    console.error(e);
  } finally {
    if (browser) await browser.close();
  }
}

test();
