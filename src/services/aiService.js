import OpenAI from 'openai';
import prisma from '../config/prisma.js';

/**
 * Service to handle modular AI steps using OpenAI API
 */
class AiService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

 /**
   * FASE 0: Menghasilkan kata kunci pencarian berita/sosmed real-time HARI INI untuk Mimika
   * @param {Array} baselines - Data acuan normal dari database
   * @returns {Promise<Array<string>>} - Array kata kunci pencarian presisi
   */
  async generateSearchQueries(baselines = []) {
    const formattedBaselines = baselines.map(b => `- ${b.category}: ${b.baselineValue}`).join('\n');
    
    // Ambil tanggal hari ini secara dinamis (Format: YYYY-MM-DD / Bahasa Indonesia)
    const todayDate = new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const systemPrompt = `Anda adalah Spesialis Pengumpul Data Intelijen & Early Warning System (EWS) Kesbangpol Kabupaten Mimika.

TUGAS UTAMA:
Hasilkan 6 hingga 8 kata kunci pencarian (search queries) yang sangat presisi, tajam, dan terstruktur untuk melacak berita online serta postingan media sosial terbaru yang terbit HARI INI (${todayDate}) terkait potensi konflik sosial, gangguan Kamtibmas, dan keresahan warga di wilayah Kabupaten Mimika.

ATURAN WAKTU & KETEPATAN (STRICT REAL-TIME):
1. FOKUS HARI INI: Pencarian WAJIB diarahkan untuk menangkap kejadian, perkembangan, dan isu terkini HARI INI (${todayDate}). Gunakan kata kunci temporal seperti "hari ini", "terbaru", "agustus 2026", atau penanda kejadian terkini.
2. JANGAN menghasilkan kata kunci umum tanpa konteks lokasi/waktu yang berisiko menarik artikel lama.

KATEGORI ISU YANG HARUS DICAKUP:
1. PANGAN & SEMBAKO: Kenaikan harga sembako ekstrem, lonjakan harga beras/minyak goreng, kelangkaan stok pangan di distrik terpencil (Agimuga, Jita, Mapurujaya, Mimika Barat, dll).
2. AKSESIBILITAS & INFRASTRUKTUR: Pemalangan jalan, pemblokiran jalur utama Tembagapura/Kwamki Narama/SP3, penutupan area vital, dermaga, atau kantor pemerintahan.
3. BBM & ENERGI: Antrean panjang kendaraan di SPBU Komodo/Nusalima, kelangkaan solar/pertalite/minyak tanah di Timika.
4. GESEKAN SOSIAL & SARA: Ujaran kebencian, isu SARA, bentrokan antar-warga/kelompok, rumor politik lokal/Pilkada Papua Tengah, dan narasi provokatif di media sosial.
5. DAMPAK ISU NASIONAL: Isu keamanan/kebijakan nasional di Papua Tengah yang berpotensi memicu demonstrasi atau keresahan lokal di Timika.

ATURAN FORMULASI KATA KUNCI (BEST PRACTICE):
- Sertakan nama entitas lokasi spesifik: "Mimika", "Timika", "Tembagapura", "Agimuga", "Kwamki Narama", "SP3", "Mapurujaya", atau "Papua Tengah".
- Gunakan variasi kata kunci pencarian publik alami DAN kombinasi Search Operators/Google Dorking sederhana (misal: 'beras mahal agimuga timika hari ini' atau 'site:detik.com "Timika" "pemalangan"').
- Panjang query ideal adalah 3 hingga 6 kata agar efektif dieksekusi oleh Google API, SerpAPI, maupun Scraper Search.`;

    const userPrompt = `Tanggal Pencarian Real-time: ${todayDate}
Acuan Baseline Normal Saat Ini:
${formattedBaselines}

Hasilkan array kata kunci pencarian terstruktur khusus untuk berita dan postingan HARI INI.`;

    try {
      const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      console.log(`[Fase 0] Generasi Query Pencarian Real-time (${todayDate}) ke OpenAI (${modelName})...`);

      const completion = await this.openai.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'search_queries_response',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                queries: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Daftar kata kunci pencarian spesifik untuk Google Custom Search / SerpAPI yang menargetkan berita hari ini'
                }
              },
              required: ['queries'],
              additionalProperties: false
            }
          }
        }
      });

      const parsedResponse = JSON.parse(completion.choices[0].message.content);
      return parsedResponse.queries;
    } catch (error) {
      console.error('Error in generateSearchQueries:', error);
      
      // Fallback kata kunci dinamis jika API gagal
      const currentYear = new Date().getFullYear();
      return [
        `berita pemalangan jalan timika mimika hari ini`,
        `harga beras mahal distrik agimuga timika ${currentYear}`,
        `kelangkaan bbm solar antrean spbu timika hari ini`,
        `demo bentrok warga mimika papua tengah terbaru`,
        `site:seputarpapua.com "Timika" "keresahan"`
      ];
    }
  }

  /**
   * FASE 1: Menyaring berita berpotensi kerusuhan menggunakan prompt user dan baseline
   * @param {Array} articles - Daftar artikel dari hasil penelusuran internet
   * @param {Array} baselines - Daftar baseline acuan dari database
   * @returns {Promise<Array>} - Array objek berita relevan
   */
  async evaluateNewsCredibility(articles, baselines = []) {
    if (!articles || articles.length === 0) {
      throw new Error('Tidak ada artikel untuk dinilai kredibilitasnya.');
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY tidak dikonfigurasi.');
    }

    const formattedBaselines = baselines.map((b, idx) => {
      return `Baseline Acuan ${idx + 1}:
- Kategori: ${b.category}
- Kondisi Normal: ${b.baselineValue}`;
    }).join('\n\n');

    const formattedArticles = articles.map((a, idx) => {
      return `Article Temp ID: ${idx}
- Title: ${a.title}
- Source: ${a.sourceName} (${a.sourceType})
- URL: ${a.url}
- Content: ${a.content}
----------------------------------------`;
    }).join('\n');

    const systemPrompt = `berikan saya berita hari ini untuk wilayah mimika yang memiliki potensi menyebabkan kerusuhan di wilayah mimika. berikan saya sumber sumber muculnya berita tersebut, cari di sosial media(FB, IG, X, TikTok, YouTube, Threads), atau media yang memiliki kredibilitas tinggi (portal.mimikakab.go.id, salampapua.com, papua60detik.id, seputarpapua.com, radartimika.co.id, tabloidjubi.com, tribunnews.com/papua.tribunnews.com, detik.com, kompas.com, tempo.co, Polri, Pemda SP 3, Humas) sertakan juga link referensi dari berita yang ditemukan.

Sebagai acuan penentu potensi kerusuhan, gunakan BASELINE keadaan aman/target pemerintah Kabupaten Mimika berikut sebagai pembanding:
${formattedBaselines}

Aturan Pemrosesan:
1. Jalankan pencarian ini hanya pada daftar artikel yang disediakan di bawah.
2. Jika artikel tidak memenuhi instruksi pencarian tersebut (tidak berpotensi memicu kerusuhan di Mimika berdasarkan perbandingan dengan baseline), JANGAN masukkan artikel tersebut ke dalam array "news_reports".`;

    const userPrompt = `Daftar artikel untuk diproses:
${formattedArticles}`;

    try {
      const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      console.log(`[Fase 1] Menyaring berita berpotensi kerusuhan ke OpenAI (${modelName})...`);

      const completion = await this.openai.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'news_filtering_response',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                news_reports: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      article_id: {
                        type: 'string',
                        description: 'ID artikel asli'
                      },
                      title: {
                        type: 'string',
                        description: 'Judul berita'
                      },
                      content: {
                        type: 'string',
                        description: 'Isi atau konten berita'
                      },
                      source: {
                        type: 'string',
                        description: 'Sumber berita'
                      },
                      url: {
                        type: 'string',
                        description: 'URL berita'
                      },
                      potential_chaos_explanation: {
                        type: 'string',
                        description: 'Penjelasan mengapa berita ini berpotensi memicu kerusuhan'
                      },
                      triangulation_group: {
                        type: 'string',
                        description: 'Nama/Label grup isu yang sama (misal: "Antrean BBM SPBU Komodo", "Pilkada Mimika 2026")'
                      },
                      supporting_sources: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            source_name: {
                              type: 'string',
                              description: 'Nama media'
                            },
                            url: {
                              type: 'string',
                              description: 'Link URL media'
                            },
                            title: {
                              type: 'string',
                              description: 'Judul artikel pendukung'
                            }
                          },
                          required: ['source_name', 'url', 'title'],
                          additionalProperties: false
                        },
                        description: 'Daftar berita lain dalam batch yang membahas isu sejenis (jika ada)'
                      }
                    },
                    required: [
                      'article_id',
                      'title',
                      'content',
                      'source',
                      'url',
                      'potential_chaos_explanation',
                      'triangulation_group',
                      'supporting_sources'
                    ],
                    additionalProperties: false
                  }
                }
              },
              required: ['news_reports'],
              additionalProperties: false
            }
          }
        }
      });

      const parsedResponse = JSON.parse(completion.choices[0].message.content);
      return parsedResponse.news_reports;
    } catch (error) {
      console.error('Error in evaluateNewsCredibility:', error);
      throw new Error(`Gagal menyaring berita: ${error.message}`);
    }
  }

  /**
   * FASE 2: Membuat analisis dampak wilayah & tingkat kerawanan berdasarkan baseline
   * @param {Array} articles - Artikel dengan kredibilitas tinggi
   * @param {Array} baselines - Dokumen acuan normal system_baselines
   * @returns {Promise<Object>} - Hasil analisis regional
   */
  async analyzeRegionalImpact(articles, baselines) {
    if (!articles || articles.length === 0) {
      throw new Error('Tidak ada artikel terverifikasi untuk dianalisis.');
    }

    const formattedBaselines = baselines.map((b, idx) => {
      return `Baseline ${idx + 1}:
- Category: ${b.category}
- Normal Reference: ${b.baselineValue}
- Description: ${b.description}
----------------------------------------`;
    }).join('\n');

    const formattedArticles = articles.map((a, idx) => {
      return `Article ${idx + 1}:
- Title: ${a.title}
- Source: ${a.sourceName} (${a.sourceType})
- Content: ${a.content}
- Credibility Score: ${a.credibilityScore} (Group: ${a.triangulationGroup})
----------------------------------------`;
    }).join('\n');

    const systemPrompt = `Anda adalah Senior Regional Analyst BRIDA Kabupaten Mimika.
Tugas Anda adalah menganalisis berita/kejadian hari ini di Mimika, membandingkannya dengan Baseline RKPD dan Kebijakan Bupati/Pemda Mimika untuk mengukur penyimpangan atau ancaman stabilitas.

Berikut adalah acuan target RKPD & Kebijakan Bupati dalam kondisi normal:
${formattedBaselines}

Aturan Analisis:
1. Hubungkan kejadian/isu di artikel secara spesifik dengan target RKPD/Kebijakan Bupati yang terganggu.
2. Tentukan tingkat risiko:
   - 'AMAN' (Selaras dengan baseline, tidak ada tensi sosial)
   - 'WASPADA' (Riak konflik minor, isu ramai di media sosial, tidak anarkis)
   - 'KRITIS/MERAH' (Penyimpangan berat, kerusuhan, demo anarkis, ancaman keamanan senjata, blokade jalan utama/kantor pemerintahan)
3. Identifikasi distrik (target_district) terdampak di Mimika.
4. Tulis ringkasan eksekutif (summary) dan prediksi dampak (predicted_impact) secara detail dalam Bahasa Indonesia.`;

    const userPrompt = `Analisis artikel-artikel kredibel berikut:
${formattedArticles}

Hasilkan laporan analisis tingkat risiko dan dampak regional.`;

    try {
      const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      console.log(`[Fase 2] Mengirim analisis dampak regional ke OpenAI (${modelName})...`);

      const completion = await this.openai.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'regional_analysis_response',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                risk_level: {
                  type: 'string',
                  enum: ['AMAN', 'WASPADA', 'KRITIS/MERAH']
                },
                primary_category: {
                  type: 'string',
                  description: 'Kategori utama isu (misal: "Infrastruktur", "Keamanan", "Ekonomi/Energi", "Birokrasi")'
                },
                target_district: {
                  type: 'string',
                  description: 'Distrik terdampak di Mimika (misal: "Mimika Baru", "Poumako", "Seluruh Mimika")'
                },
                summary: {
                  type: 'string',
                  description: 'Ringkasan eksekutif analisis yang menjelaskan keterkaitan kejadian dengan target RKPD / Kebijakan Bupati.'
                },
                predicted_impact: {
                  type: 'string',
                  description: 'Prediksi dampak sosial, politik, atau ekonomi jika isu tidak segera ditangani.'
                }
              },
              required: ['risk_level', 'primary_category', 'target_district', 'summary', 'predicted_impact'],
              additionalProperties: false
            }
          }
        }
      });

      return {
        analysis: JSON.parse(completion.choices[0].message.content),
        rawResponse: completion
      };
    } catch (error) {
      console.error('Error in analyzeRegionalImpact:', error);
      throw new Error(`Gagal menganalisis dampak regional: ${error.message}`);
    }
  }

  /**
   * FASE 3: Menghasilkan rekomendasi taktis untuk OPD terkait
   * @param {Object} analysis - Output dari Fase 2
   * @returns {Promise<Object>} - Rekomendasi aksi mitigasi & OPD penanggung jawab
   */
  async generateOpdRecommendations(analysis) {
    const systemPrompt = `Anda adalah Staf Ahli Kebijakan Publik Pemda Kabupaten Mimika.
Tugas Anda adalah menyusun rekomendasi aksi mitigasi taktis yang konkret dan menunjuk OPD (Organisasi Perangkat Daerah) Kabupaten Mimika yang bertanggung jawab untuk menangani isu yang telah dianalisis.

Detail Analisis Isu:
- Kategori: ${analysis.primaryCategory}
- Distrik Terdampak: ${analysis.targetDistrict}
- Risiko: ${analysis.riskLevel}
- Ringkasan: ${analysis.summary}
- Prediksi Dampak: ${analysis.predictedImpact}

Instruksi Rekomendasi:
1. Rekomendasi tindakan harus sangat konkret, praktis, dan dapat dieksekusi oleh pemerintah daerah Mimika.
2. Tentukan satu atau beberapa OPD utama yang bertugas (contoh: "Dinas Perhubungan dan Satpol PP Kabupaten Mimika").`;

    const userPrompt = `Rumuskan rekomendasi tindakan mitigasi dinas (OPD) untuk isu di atas dalam Bahasa Indonesia.`;

    try {
      const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      console.log(`[Fase 3] Mengirim permintaan rekomendasi OPD ke OpenAI (${modelName})...`);

      const completion = await this.openai.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'opd_recommendations_response',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                recommended_actions: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  description: 'Daftar aksi taktis penanggulangan (minimal 3 rekomendasi)'
                },
                responsible_opd: {
                  type: 'string',
                  description: 'Nama OPD Kabupaten Mimika yang menjadi penanggung jawab utama'
                }
              },
              required: ['recommended_actions', 'responsible_opd'],
              additionalProperties: false
            }
          }
        }
      });

      return JSON.parse(completion.choices[0].message.content);
    } catch (error) {
      console.error('Error in generateOpdRecommendations:', error);
      throw new Error(`Gagal menghasilkan rekomendasi OPD: ${error.message}`);
    }
  }
}

export default new AiService();
