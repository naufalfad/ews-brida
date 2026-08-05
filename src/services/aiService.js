import OpenAI from 'openai';
import prisma from '../config/prisma.js';

/**
 * Service to handle EWS AI processing steps using OpenAI API
 */
class AiService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * TAHAP 1: Query Expansion
   * Mengubah kueri pencarian sederhana dari pengguna menjadi kata kunci Google News RSS yang optimal.
   * @param {string} userQuery - Input kueri sederhana dari pengguna (misal: "solar", "lahan")
   * @returns {Promise<string>} - Kueri pencarian Google News yang dioptimalkan
   */
  async expandSearchQuery(userQuery) {
    if (!userQuery || userQuery.trim().length === 0) {
      return 'mimika';
    }

    const systemPrompt = `Anda adalah Asisten Analis EWS (Early Warning System) BRIDA Kabupaten Mimika.
Tugas Anda adalah mengubah kueri pencarian sederhana dari user menjadi kueri pencarian berita Google News yang optimal untuk menemukan berita, isu, atau laporan di Kabupaten Mimika yang berpotensi memicu keributan, kepanikan, kecemasan, kekhawatiran, atau rasa tidak aman di masyarakat.

Aturan Pencarian EWS Mimika:
Cari berita atau isu terkait kueri user dari wilayah Kabupaten Mimika / Kota Timika yang bersumber dari:
1. Media Sosial/Laporan warga (seperti Instagram, X/Twitter, Facebook, TikTok, YouTube, Threads, dll).
2. Berita Online (portal berita lokal atau nasional yang meliput Mimika).
3. Isu liar/kasus hangat di masyarakat.
4. Laporan Kepolisian.
5. Laporan Pemerintah Daerah.

Aturan Kueri:
1. Kueri harus relevan dengan konteks wilayah Kabupaten Mimika atau Kota Timika.
2. Tambahkan kata kunci sinonim, platform sumber, atau indikator keresahan sosial/emosi publik yang relevan dengan topik.
3. Kueri akhir harus ringkas dan efektif untuk mesin pencari Google News.
4. Hasil harus dalam format JSON dengan properti "search_query".`;

    const userPrompt = `Kueri sederhana user: "${userQuery}"`;

    try {
      const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      console.log(`[Tahap 1 - Query Expansion] Memproses kueri "${userQuery}" menggunakan OpenAI (${modelName})...`);

      const completion = await this.openai.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'query_expansion_response',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                search_query: {
                  type: 'string',
                  description: 'Kueri pencarian Google News yang optimal.'
                }
              },
              required: ['search_query'],
              additionalProperties: false
            }
          }
        }
      });

      const result = JSON.parse(completion.choices[0].message.content);
      console.log(`[Tahap 1 - Query Expansion] Hasil ekspansi kueri: "${result.search_query}"`);
      return result.search_query;
    } catch (error) {
      console.error('[AiService] Gagal mengekspansi kueri:', error);
      // Fallback aman jika terjadi kegagalan
      return `mimika ${userQuery}`;
    }
  }

  /**
   * TAHAP 1: Baseline-Driven Filtering
   * Menyaring berita hasil internet yang menyimpang dari kondisi baseline daerah Mimika
   * dan memiliki potensi menimbulkan kepanikan, kecemasan, rasa tidak aman, atau konflik sosial.
   * @param {Array} articles - Artikel mentah dari Google News
   * @param {Array} baselines - Baseline acuan normal dari database
   * @returns {Promise<Array>} - Daftar Isu EWS Draf yang teridentifikasi
   */
  async filterIssuesAgainstBaselines(articles, baselines) {
    if (!articles || articles.length === 0) {
      return [];
    }

    const formattedBaselines = baselines.map((b, idx) => {
      return `Baseline ${idx + 1} (${b.category}):
- Kondisi Normal: ${b.baselineValue}
- Deskripsi: ${b.description}`;
    }).join('\n\n');

    const formattedArticles = articles.map((a, idx) => {
      return `Artikel ID: ${idx}
- Judul: ${a.title}
- Media/Sumber: ${a.sourceName}
- Tautan/URL: ${a.url}
- Waktu Terbit/Umur: ${a.publishedAge || 'tidak diketahui'}
- Ringkasan: ${a.content}`;
    }).join('\n\n');

    const systemPrompt = `Anda adalah Asisten Analis EWS (Early Warning System) BRIDA Kabupaten Mimika.
Tugas Anda adalah menyaring artikel-artikel berita terkini di Kabupaten Mimika dan membandingkannya dengan Baseline Kondisi Normal di bawah ini.

Berikut adalah Baseline Kondisi Normal Kabupaten Mimika:
=========================================
${formattedBaselines}
=========================================

Definisi "Kerusuhan & Keresahan" EWS Mimika:
Kerusuhan tidak hanya mencakup perusakan fisik atau tindakan arogansi kelompok/individu, tetapi juga mencakup kepanikan, kecemasan, kekhawatiran, serta rasa tidak aman/tidak nyaman yang timbul di tengah masyarakat akibat isu atau kejadian yang beredar.

Aturan Penyaringan & Pengelompokan:
1. Temukan artikel yang melaporkan kejadian yang menyimpang/anomali dari baseline kondisi normal tersebut.
2. Penyimpangan tersebut HANYA diloloskan jika berpotensi memicu "Kerusuhan & Keresahan" di kalangan masyarakat Mimika sesuai definisi di atas.
3. PISAHKAN TOPIK / KEJADIAN YANG BERBEDA: Jangan menggabungkan kejadian atau topik yang berbeda (misalnya: demonstrasi politik/KNPB tidak boleh digabungkan dengan peristiwa pembunuhan/penembakan kriminal, atau masalah sengketa lahan, atau antrean BBM). Setiap topik kejadian yang berdiri sendiri harus dilaporkan sebagai entri isu terpisah agar output bersifat dinamis.
4. GABUNGKAN HANYA BERITA SEJENIS (TRIANGULASI): Jika terdapat beberapa artikel yang membahas satu kejadian/isu yang sama persis, gabungkan menjadi SATU entri isu:
   - Tentukan judul isu yang netral dan komprehensif.
   - Gabungkan ringkasan isi kejadiannya.
   - Ambil artikel pertama/paling representatif sebagai sumber utama (source_name dan source_url).
   - Kumpulkan seluruh artikel pendukung (termasuk yang utama) ke dalam array "sources" yang berisi objek {source_name, url, published_age}. Tentukan "published_age" sesuai data umur artikel masukan.
   - Pada deskripsi isu, sertakan informasi waktu publikasi relatif (contoh: "... [Diterbitkan 3 hari yang lalu]" atau jika triangulasi gabungan beberapa hari berbeda: "... [Diterbitkan antara 1 s.d. 5 hari yang lalu]").
5. Laporkan setiap peristiwa kejahatan kekerasan penting (seperti penembakan oleh aparat, pembunuhan, atau tindakan main hakim sendiri) sebagai deviasi keamanan EWS karena peristiwa semacam ini di Mimika sangat rentan memicu aksi balasan atau keresahan sosial.
6. Jika tidak ada artikel berita yang menyimpang dari baseline atau berpotensi memicu kecemasan/keresahan warga, kembalikan array "issues" kosong [].`;

    const userPrompt = `Daftar artikel berita untuk dianalisis:
=========================================
${formattedArticles}
=========================================`;

    try {
      const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      console.log(`[Tahap 1 - Filtering] Menganalisis ${articles.length} berita terhadap ${baselines.length} baseline menggunakan OpenAI (${modelName})...`);

      const completion = await this.openai.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'baseline_filtering_response',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                issues: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: {
                        type: 'string',
                        description: 'Judul isu yang representatif tentang penyimpangan yang terdeteksi.'
                      },
                      description: {
                        type: 'string',
                        description: 'Rangkuman kronologi kejadian atau isu penyimpangan.'
                      },
                      source_name: {
                        type: 'string',
                        description: 'Nama media sumber utama informasi.'
                      },
                      source_url: {
                        type: 'string',
                        description: 'URL/tautan ke artikel sumber utama.'
                      },
                      sources: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            source_name: { type: 'string' },
                            url: { type: 'string' },
                            published_age: {
                              type: 'string',
                              description: 'Keterangan waktu terbit relatif artikel ini (contoh: "hari ini" atau "3 hari yang lalu").'
                            }
                          },
                          required: ['source_name', 'url', 'published_age'],
                          additionalProperties: false
                        },
                        description: 'Kumpulan media yang memberitakan isu yang sama (triangulasi).'
                      }
                    },
                    required: ['title', 'description', 'source_name', 'source_url', 'sources'],
                    additionalProperties: false
                  }
                }
              },
              required: ['issues'],
              additionalProperties: false
            }
          }
        }
      });

      const parsedResponse = JSON.parse(completion.choices[0].message.content);
      return parsedResponse.issues;
    } catch (error) {
      console.error('[AiService] Gagal memfilter isu terhadap baseline:', error);
      throw new Error(`Gagal memfilter berita terhadap baseline: ${error.message}`);
    }
  }

  /**
   * TAHAP 2: Analisis Kredibilitas & Deteksi Hoax (Placeholder - untuk dikembangkan di Tahap 2)
   */
  async checkHoaxCredibility(issueId) {
    // Akan diimplementasikan pada Tahap 2
    console.log(`[AiService] checkHoaxCredibility dipanggil untuk Isu ID: ${issueId}`);
    return null;
  }

  /**
   * TAHAP 3: Analisis Mendalam Dampak Isu (Placeholder - untuk dikembangkan di Tahap 3)
   */
  async analyzeDeepImpact(issueId) {
    // Akan diimplementasikan pada Tahap 3
    console.log(`[AiService] analyzeDeepImpact dipanggil untuk Isu ID: ${issueId}`);
    return null;
  }

  /**
   * TAHAP 4: Mitigasi & Rekomendasi OPD (Placeholder - untuk dikembangkan di Tahap 4)
   */
  async generateMitigationRecommendations(issueId) {
    // Akan diimplementasikan pada Tahap 4
    console.log(`[AiService] generateMitigationRecommendations dipanggil untuk Isu ID: ${issueId}`);
    return null;
  }
}

export default new AiService();
