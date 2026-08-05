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
    
    const todayDate = new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const systemPrompt = `Anda adalah Spesialis Pengumpul Data Intelijen & Early Warning System (EWS) Kesbangpol Kabupaten Mimika.

TUGAS UTAMA:
Hasilkan 6 hingga 8 kata kunci pencarian (search queries) yang sangat presisi dan terstruktur untuk melacak berita online serta postingan media sosial terbaru yang terbit HARI INI (${todayDate}) terkait potensi konflik sosial, gangguan Kamtibmas, dan keresahan warga di wilayah Kabupaten Mimika.

KATEGORI ISU YANG HARUS DICAKUP:
1. PANGAN & SEMBAKO: Kenaikan harga sembako ekstrem, lonjakan harga beras/minyak goreng di distrik terpencil (Agimuga, Jita, Mapurujaya, dll).
2. AKSESIBILITAS & INFRASTRUKTUR: Pemalangan jalan, pemblokiran jalur utama Tembagapura/Kwamki Narama/SP3, penutupan kantor pemerintah/area vital.
3. BBM & ENERGI: Antrean panjang kendaraan di SPBU Komodo/Nusalima, kelangkaan solar/pertalite/minyak tanah di Timika.
4. GESEKAN SOSIAL & SARA: Ujaran kebencian, isu SARA, bentrokan antar-warga/kelompok, rumor politik lokal/Pilkada Papua Tengah, dan narasi provokatif.

ATURAN FORMULASI:
- Sertakan entitas lokasi spesifik: "Mimika", "Timika", "Tembagapura", "Agimuga", "Kwamki Narama", "SP3", "Mapurujaya", atau "Papua Tengah".
- Gunakan kombinasi kata kunci alami DAN Search Operators/Google Dorking sederhana (misal: 'beras mahal agimuga timika hari ini' atau 'site:seputarpapua.com "Timika" "pemalangan"').`;

    const userPrompt = `Tanggal Pencarian Real-time: ${todayDate}\nAcuan Baseline Normal:\n${formattedBaselines}`;

    try {
      const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
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
                  description: 'Daftar kata kunci pencarian spesifik untuk Google Custom Search / SerpAPI'
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
      return [
        `berita pemalangan jalan timika mimika hari ini`,
        `harga beras mahal distrik agimuga timika`,
        `kelangkaan bbm solar antrean spbu timika hari ini`,
        `demo bentrok warga mimika papua tengah terbaru`
      ];
    }
  }

  /**
   * FASE 1: Menganalisis Kredibilitas, Membenturkan Baseline (Triangulasi), & Menyaring Isu
   * @param {Array} articles - Daftar artikel/postingan mentah dari database (RawArticle)
   * @param {Array} baselines - Data acuan normal dari database Prisma (system_baselines)
   * @returns {Promise<Array>} - Array berita terverifikasi beserta hasil triangulasi
   */
  async evaluateNewsCredibility(articles, baselines = []) {
    if (!articles || articles.length === 0) {
      throw new Error('Tidak ada artikel/postingan untuk dinilai kredibilitasnya.');
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY tidak dikonfigurasi.');
    }

    // Format data baseline sebagai RAG Context
    const formattedBaselines = baselines.map((b, idx) => {
      return `Baseline Acuan ${idx + 1}:
- Kategori: ${b.category}
- Kondisi Normal/HET/Target: ${b.baselineValue}
- Deskripsi/Aturan: ${b.description || '-'}`;
    }).join('\n\n');

    // Format artikel mentah dari DB
    const formattedArticles = articles.map((a, idx) => {
      return `[Article DB ID: ${a.id || idx}]
- Judul/Post: ${a.title}
- Sumber: ${a.sourceName} (${a.sourceType || 'NEWS_PORTAL'})
- URL: ${a.url}
- Konten/Snippet: ${a.content}
----------------------------------------`;
    }).join('\n');

    const systemPrompt = `Anda adalah Engine Analis Intelijen & Fact-Checking Triangulasi EWS (Early Warning System) Kesbangpol Kabupaten Mimika.

TUGAS UTAMA:
Evaluasi secara ketat DAFTAR ARTIKEL / POSTINGAN di bawah ini. Benturkan klaim dalam artikel tersebut dengan DATA BASELINE RESMI PEMKAB MIMIKA (RAG CONTEXT) untuk menentukan apakah berita/postingan tersebut merupakan FAKTA, HOAKS, PROVOKASI, atau UNVERIFIED.

DATA BASELINE PEMKAB MIMIKA (RAG CONTEXT):
${formattedBaselines}

ATURAN EVALUASI & TRIANGULASI (STRICT RULES):
1. DILARANG MEMBUAT BERITA PALSU: HANYA proses artikel yang disediakan dalam input "Daftar Artikel".
2. Tentukan "category":
   - "PANGAN": Terkait harga beras, minyak, sembako, stok Bulog.
   - "AKSESIBILITAS": Terkait pemalangan jalan, blokade Tembagapura/Agimuga, penutupan kantor.
   - "BBM": Terkait antrean SPBU, kelangkaan solar/pertalite/minyak tanah.
   - "GESEKAN_SOSIAL": Terkait ujaran kebencian, bentrokan warga, isu SARA, atau provokasi politik.
3. Tentukan "validation_status":
   - "FAKTA": Klaim sesuai/didukung oleh data baseline atau laporan lapangan yang valid.
   - "HOAKS": Klaim terbukti salah, memanipulasi data harga/stok, atau menyebarkan rumor bohong.
   - "PROVOKASI": Narasi sengaja mengajak tindakan anarkis, pemalangan, atau kerusuhan.
   - "UNVERIFIED": Belum ada data baseline/bukti pendukung yang cukup.
4. Hitung "credibility_score" (0.00 hingga 1.00) berdasarkan keandalan sumber dan kesesuaian fakta baseline.
5. Tentukan "risk_level": "MERAH" (Kritis/Gawat), "ORANYE" (Tinggi), "KUNING" (Sedang), "HIJAU" (Aman).
6. Tuliskan "ai_reasoning": WAJIB berisi persis 3 poin penalaran logis mengapa status validasi tersebut dipilih.
7. Jika artikel sama sekali TIDAK berpotensi menimbulkan keresahan/konflik sosial di Mimika, JANGAN masukkan artikel tersebut ke dalam hasil output.`;

    const userPrompt = `Daftar Artikel Mentah untuk Evaluasi & Triangulasi:\n${formattedArticles}`;

    try {
      const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      console.log(`[Fase 1] Menganalisis kredibilitas & triangulasi RAG (${modelName})...`);

      const completion = await this.openai.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'news_triangulation_response',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                verified_reports: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      article_id: {
                        type: 'string',
                        description: 'ID artikel asli dari DB input'
                      },
                      title: {
                        type: 'string',
                        description: 'Judul berita atau ringkasan klaim warga'
                      },
                      category: {
                        type: 'string',
                        enum: ['PANGAN', 'AKSESIBILITAS', 'BBM', 'GESEKAN_SOSIAL'],
                        description: 'Kategori utama isu'
                      },
                      validation_status: {
                        type: 'string',
                        enum: ['FAKTA', 'HOAKS', 'PROVOKASI', 'UNVERIFIED'],
                        description: 'Status hasil triangulasi kebenaran isu'
                      },
                      credibility_score: {
                        type: 'number',
                        description: 'Skor kredibilitas klaim (0.00 hingga 1.00)'
                      },
                      risk_level: {
                        type: 'string',
                        enum: ['MERAH', 'ORANYE', 'KUNING', 'HIJAU'],
                        description: 'Tingkat kerawanan potensi konflik'
                      },
                      source_name: {
                        type: 'string',
                        description: 'Nama media / platform sosmed'
                      },
                      url: {
                        type: 'string',
                        description: 'URL sumber berita/postingan'
                      },
                      factual_comparison: {
                        type: 'string',
                        description: 'Ringkasan perbandingan klaim warga vs fakta baseline Pemkab'
                      },
                      ai_reasoning: {
                        type: 'array',
                        items: { type: 'string' },
                        description: '3 poin penalaran logis AI'
                      },
                      triangulation_group: {
                        type: 'string',
                        description: 'Label kelompok isu sejenis (misal: "Isu Beras Agimuga", "Pemalangan Jalan Tembagapura")'
                      }
                    },
                    required: [
                      'article_id',
                      'title',
                      'category',
                      'validation_status',
                      'credibility_score',
                      'risk_level',
                      'source_name',
                      'url',
                      'factual_comparison',
                      'ai_reasoning',
                      'triangulation_group'
                    ],
                    additionalProperties: false
                  }
                }
              },
              required: ['verified_reports'],
              additionalProperties: false
            }
          }
        }
      });

      const parsedResponse = JSON.parse(completion.choices[0].message.content);
      return parsedResponse.verified_reports;
    } catch (error) {
      console.error('Error in evaluateNewsCredibility:', error);
      throw new Error(`Gagal memvalidasi kredibilitas isu: ${error.message}`);
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
