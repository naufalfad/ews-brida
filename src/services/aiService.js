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
   * FASE 1: Mencari dan memilah berita berpotensi kerusuhan/keributan berdasarkan sektor
   * @param {Array} articles - Daftar artikel dari hasil penelusuran internet
   * @param {string} sector - Sektor fokus pencarian (contoh: ekonomi, politik, infrastruktur)
   * @param {Array} baselines - Daftar baseline acuan dari database
   * @returns {Promise<Array>} - Array objek berita relevan
   */
  async searchNews(articles, sector = 'umum', baselines = []) {
    if (!articles || articles.length === 0) {
      throw new Error('Tidak ada artikel untuk dicari beritanya.');
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY tidak dikonfigurasi.');
    }

    const formattedArticles = articles.map((a, idx) => {
      return `Article ID: ${idx}
- Title: ${a.title}
- Source: ${a.sourceName}
- URL: ${a.url}
- Summary: ${a.content}
----------------------------------------`;
    }).join('\n');

    const systemPrompt = `Anda adalah Asisten Analis EWS (Early Warning System) BRIDA Kabupaten Mimika.
Tugas utama Anda adalah memilah berita di wilayah Kabupaten Mimika dalam 24 jam terakhir yang memiliki potensi menimbulkan keributan, kecemasan publik, ketidaknyamanan warga, konflik sosial, atau gangguan ketertiban umum di masyarakat Mimika.

Pencarian saat ini sedang difokuskan khusus pada sektor: "${sector}".

Aturan Pemrosesan secara Ketat:
1. Jalankan penyaringan ini HANYA pada daftar artikel yang disediakan di bawah.
2. Berita HANYA boleh diloloskan jika isi berita tersebut SECARA LANGSUNG berkaitan dengan sektor "${sector}" DAN memiliki potensi memicu keributan, kecemasan publik, ketidaknyamanan, atau konflik di masyarakat Mimika.
3. JIKA BERITA TIDAK RELEVAN DENGAN SEKTOR "${sector}" ATAU tidak berpotensi menimbulkan keributan/kerusuhan, JANGAN masukkan artikel tersebut ke dalam array "news_reports".
4. GABUNGKAN BERITA REDUNDAN: Jika beberapa media memberitakan kejadian yang sama persis, gabungkan mereka menjadi SATU entri berita saja di "news_reports". Tuliskan judul dan isi berita utama secara ringkas, kemudian kumpulkan seluruh nama media dan URL tautan aslinya ke dalam array "sources".
5. Jika tidak ada berita yang memenuhi kriteria di atas, kembalikan array "news_reports" sebagai array kosong [].`;

    const userPrompt = `Daftar artikel untuk diproses:
${formattedArticles}`;

    try {
      const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      console.log(`[Fase 1] Menyaring berita EWS sektor "${sector}" menggunakan OpenAI (${modelName})...`);

      const completion = await this.openai.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'ews_news_reports_response',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                news_reports: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: {
                        type: 'string',
                        description: 'Judul berita yang informatif dan representatif.'
                      },
                      content: {
                        type: 'string',
                        description: 'Ringkasan isi berita.'
                      },
                      potential_impact: {
                        type: 'string',
                        description: 'Potensi dampak buruk, kecemasan, keributan, atau kerusuhan yang akan terjadi di masyarakat Mimika jika tidak ada tindakan/mitigasi.'
                      },
                      sources: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            source_name: {
                              type: 'string',
                              description: 'Nama media atau sosial media asal berita.'
                            },
                            url: {
                              type: 'string',
                              description: 'Link URL berita tersebut.'
                            }
                          },
                          required: ['source_name', 'url'],
                          additionalProperties: false
                        },
                        description: 'Kumpulan seluruh sumber dan URL link dari berita ganda/redundant yang membicarakan kejadian yang sama.'
                      }
                    },
                    required: ['title', 'content', 'potential_impact', 'sources'],
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
      console.error('Error in searchNews:', error);
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
