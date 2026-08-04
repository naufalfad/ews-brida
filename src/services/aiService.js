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
   * FASE 1: Menilai kredibilitas berita dan menentukan grup triangulasi
   * @param {Array} articles - Daftar artikel mentah dari database
   * @returns {Promise<Array>} - Array objek evaluasi kredibilitas
   */
  async evaluateNewsCredibility(articles) {
    if (!articles || articles.length === 0) {
      throw new Error('Tidak ada artikel untuk dinilai kredibilitasnya.');
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY tidak dikonfigurasi.');
    }

    const formattedArticles = articles.map((a, idx) => {
      return `Article ID: ${a.id}
- Title: ${a.title}
- Source: ${a.sourceName} (${a.sourceType})
- URL: ${a.url}
- Content: ${a.content}
----------------------------------------`;
    }).join('\n');

    const systemPrompt = `Anda adalah Asisten Analis Data BRIDA Kabupaten Mimika.
Tugas Anda adalah menilai kredibilitas berita berdasarkan tiga parameter utama (skala 0 - 100):
1. Source Reliability (S) - Keandalan Sumber:
   - Laporan Instansi Resmi (Polri, Pemda, Humas): 90-100
   - Media Online Resmi Terverifikasi (detik.com, Radar Timika): 75-89
   - Komunitas/Laporan Warga Terverifikasi: 50-74
   - Akun Media Sosial Pribadi/Publik Umum (FB, IG, TikTok): 10-49
2. Triangulation Factor (T) - Faktor Triangulasi:
   - Apakah isu ini diberitakan oleh banyak sumber independen yang berbeda?
   - 3 atau lebih sumber independen: 100
   - 2 sumber independen: 60
   - Hanya 1 sumber tunggal (tidak ada pembanding): 20
3. Completeness (C) - Kelengkapan Informasi:
   - Ketersediaan detail 5W+1H (Kejadian, Lokasi Distrik spesifik di Mimika, Waktu, Pelaku, Kronologi).
   - Lengkap & presisi: 90-100
   - Sedang (hanya menyebut kota/Timika secara umum): 50-89
   - Sangat minim/opini: 10-49

Kelompokkan juga artikel yang membahas isu/kejadian yang sama ke dalam "triangulation_group" yang sama (beri nama label grup yang deskriptif dalam Bahasa Indonesia).`;

    const userPrompt = `Berikut adalah daftar artikel mentah hari ini:
${formattedArticles}

Silakan lakukan penilaian kredibilitas untuk masing-masing artikel di atas.`;

    try {
      const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      console.log(`[Fase 1] Mengirim analisis kredibilitas ke OpenAI (${modelName})...`);

      const completion = await this.openai.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'news_credibility_response',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                evaluations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      article_id: {
                        type: 'string',
                        description: 'ID artikel yang dinilai'
                      },
                      triangulation_group: {
                        type: 'string',
                        description: 'Nama/Label grup isu yang sama (misal: "Antrean BBM SPBU Komodo", "Pilkada Mimika 2026")'
                      },
                      source_reliability_score: {
                        type: 'number',
                        description: 'Skor Keandalan Sumber (S) 0-100'
                      },
                      triangulation_score: {
                        type: 'number',
                        description: 'Skor Triangulasi (T) 0-100'
                      },
                      completeness_score: {
                        type: 'number',
                        description: 'Skor Kelengkapan (C) 0-100'
                      },
                      reasoning: {
                        type: 'string',
                        description: 'Alasan penentuan skoring dalam Bahasa Indonesia'
                      }
                    },
                    required: [
                      'article_id',
                      'triangulation_group',
                      'source_reliability_score',
                      'triangulation_score',
                      'completeness_score',
                      'reasoning'
                    ],
                    additionalProperties: false
                  }
                }
              },
              required: ['evaluations'],
              additionalProperties: false
            }
          }
        }
      });

      const parsedResponse = JSON.parse(completion.choices[0].message.content);
      return parsedResponse.evaluations;
    } catch (error) {
      console.error('Error in evaluateNewsCredibility:', error);
      throw new Error(`Gagal mengevaluasi kredibilitas: ${error.message}`);
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
