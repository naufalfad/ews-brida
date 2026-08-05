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
   * TAHAP 2: Analisis Kredibilitas & Deteksi Hoax
   * Mengevaluasi apakah isu yang dikumpulkan merupakan hoaks atau berita kredibel.
   * @param {string} issueId - ID isu yang akan diverifikasi
   * @returns {Promise<Object>} - Hasil analisis hoax { is_hoax, verification_score, verification_notes }
   */
  async checkHoaxCredibility(issueId) {
    try {
      // 1. Tarik data isu dari database
      const issue = await prisma.ewsIssue.findUnique({
        where: { id: issueId }
      });

      if (!issue) {
        throw new Error(`Isu dengan ID ${issueId} tidak ditemukan.`);
      }

      // 2. Tarik baseline kondisi normal daerah
      const baselines = await prisma.systemBaseline.findMany();

      const formattedBaselines = baselines.map((b, idx) => {
        return `Baseline ${idx + 1} (${b.category}):
- Kondisi Normal: ${b.baselineValue}
- Deskripsi: ${b.description}`;
      }).join('\n\n');

      // 3. Format detail isu dan sumbernya
      const sourcesList = Array.isArray(issue.sources) ? issue.sources : [];
      const formattedSources = sourcesList.map((s, idx) => {
        return `- Sumber ${idx + 1}: ${s.source_name} (${s.published_age || 'tidak diketahui'}), URL: ${s.url}`;
      }).join('\n');

      const systemPrompt = `Anda adalah Asisten Analis EWS (Early Warning System) BRIDA Kabupaten Mimika.
Tugas Anda adalah melakukan evaluasi kredibilitas dan mendeteksi apakah suatu isu/berita yang beredar merupakan hoaks (disinformasi/berita bohong) atau berita kredibel (fakta).

Berikut adalah Baseline Kondisi Normal Kabupaten Mimika:
=========================================
${formattedBaselines}
=========================================

Kriteria Evaluasi Kredibilitas:
1. Kredibilitas Media Sumber: Media resmi nasional (seperti ANTARA, Tribunnews, dll) dan media lokal Papua terkemuka (Salam Papua, Fajar Papua, Koreri, Seputar Papua, Timika Express, dll) memiliki tingkat kredibilitas tinggi. Media blog pribadi, forum diskusi, atau tautan anonim media sosial memiliki kredibilitas lebih rendah.
2. Konsistensi & Triangulasi: Jika isu diberitakan oleh lebih dari satu media independen yang berbeda (triangulasi), kemungkinan kredibel sangat tinggi.
3. Perbandingan dengan Baseline: Evaluasi apakah kejadian yang dilaporkan masuk akal, atau merupakan eksagerasi yang tidak rasional berdasarkan kondisi daerah yang sesungguhnya.

Aturan Output:
- is_hoax (boolean): Tentukan true jika isu ini terindikasi kuat sebagai hoaks, berita bohong, atau rumor tidak berdasar. Tentukan false jika isu ini kredibel/nyata berdasarkan fakta media terpercaya.
- verification_score (number): Berikan skor keyakinan kredibilitas antara 0 s.d. 100.
  * 80 - 100: Sangat Kredibel (dilaporkan oleh banyak media resmi terpercaya).
  * 50 - 79: Cukup Kredibel (dilaporkan oleh media lokal terbatas, membutuhkan pemantauan).
  * 0 - 49: Indikasi Hoax / Rumor Liar (sumber tidak jelas, tidak ada triangulasi, bertolak belakang dengan fakta).
- verification_notes (string): Penjelasan logis mengapa Anda menentukan status hoax/kredibel tersebut, mencakup analisis kredibilitas sumber pendukungnya.`;

      const userPrompt = `Isu EWS yang akan dianalisis:
=========================================
Judul Isu: ${issue.title}
Deskripsi/Kronologi: ${issue.description}
Sumber Pendukung:
${formattedSources}
=========================================`;

      const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      console.log(`[Tahap 2 - Hoax Check] Mengevaluasi kredibilitas Isu ID: ${issueId} menggunakan OpenAI (${modelName})...`);

      const completion = await this.openai.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'hoax_check_response',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                is_hoax: {
                  type: 'boolean',
                  description: 'Status apakah isu ini merupakan hoax.'
                },
                verification_score: {
                  type: 'number',
                  description: 'Skor kredibilitas dari isu (0 - 100).'
                },
                verification_notes: {
                  type: 'string',
                  description: 'Penjelasan alasan penentuan status hoax/kredibel.'
                }
              },
              required: ['is_hoax', 'verification_score', 'verification_notes'],
              additionalProperties: false
            }
          }
        }
      });

      const parsedResponse = JSON.parse(completion.choices[0].message.content);
      console.log(`[Tahap 2 - Hoax Check] Hasil: is_hoax=${parsedResponse.is_hoax}, score=${parsedResponse.verification_score}`);
      return parsedResponse;

    } catch (error) {
      console.error('[AiService] Gagal memvalidasi kredibilitas hoax:', error);
      throw new Error(`Gagal mengevaluasi kredibilitas isu: ${error.message}`);
    }
  }

  /**
   * TAHAP 3: Analisis Mendalam Dampak Isu
   * Melakukan analisis mendalam terhadap isu yang telah dinyatakan kredibel.
   * @param {string} issueId - ID isu yang akan dianalisis
   * @returns {Promise<Object>} - Hasil analisis mendalam { risk_level, primary_category, target_district, analysis_summary, predicted_impact }
   */
  async analyzeDeepImpact(issueId) {
    try {
      // 1. Tarik data isu dari database
      const issue = await prisma.ewsIssue.findUnique({
        where: { id: issueId }
      });

      if (!issue) {
        throw new Error(`Isu dengan ID ${issueId} tidak ditemukan.`);
      }

      // 2. Tarik baseline kondisi normal daerah
      const baselines = await prisma.systemBaseline.findMany();

      const formattedBaselines = baselines.map((b, idx) => {
        return `Baseline ${idx + 1} (${b.category}):
- Kondisi Normal: ${b.baselineValue}
- Deskripsi: ${b.description}`;
      }).join('\n\n');

      const systemPrompt = `Anda adalah Asisten Analis EWS (Early Warning System) BRIDA Kabupaten Mimika.
Tugas Anda adalah melakukan analisis mendalam mengenai potensi dampak dan tingkat risiko konflik dari isu yang telah dikonfirmasi Kredibel (Fakta).

Berikut adalah Baseline Kondisi Normal Kabupaten Mimika:
=========================================
${formattedBaselines}
=========================================

Kriteria Skoring Risiko EWS Mimika:
1. 'AMAN':
   - Riak kecil di kalangan warga yang tidak mengganggu ketertiban umum.
   - Tidak ada indikasi keterlibatan senjata tajam, kekerasan fisik, atau aksi massa.
   - Keresahan warga minim dan bisa diredam oleh aparat/tokoh masyarakat setempat secara instan.
2. 'WASPADA':
   - Terdapat potensi eskalasi keresahan akibat isu (misalnya antrean BBM yang panjang, klaim kelaparan, atau ketegangan sengketa lahan tanpa kekerasan).
   - Terdapat seruan atau rencana aksi demonstrasi damai di lokasi perkantoran pemerintah/umum.
   - Kejadian yang menyimpang dari baseline secara moderat.
3. 'KRITIS/MERAH':
   - Terjadi kekerasan fisik (seperti pembunuhan, penembakan, bentrokan fisik antar-kelompok/suku, aksi penyerangan/penjarahan).
   - Aksi pemblokiran jalan raya utama, penyerangan objek vital nasional (seperti area PT Freeport Indonesia), atau aksi anarkis yang melumpuhkan aktivitas publik.
   - Adanya mobilisasi massa bersenjata tradisional/tajam dengan potensi aksi balas dendam yang tinggi.

Aturan Output:
- risk_level (string): Pilih salah satu dari: "AMAN", "WASPADA", atau "KRITIS/MERAH".
- primary_category (string): Tentukan kategori utama isu ini (contoh: "Keamanan/Suku", "Ekonomi/Pangan", "Politik/Demo", "Kriminalitas", "Sengketa Lahan").
- target_district (string): Identifikasi nama distrik spesifik di Kabupaten Mimika tempat kejadian berlangsung atau yang paling terdampak (contoh: "Kwamki Narama", "Mimika Baru", "Tembagapura", "Kuala Kencana", "Wania", "Iwaka", "Mimika Timur"). Jika tidak ada distrik yang spesifik, tulis "Kabupaten Mimika".
- analysis_summary (string): Analisis naratif singkat dan tajam (2-3 paragraf) mengenai dinamika isu, faktor pemicu, dan mengapa isu ini masuk dalam kategori tingkat risiko yang Anda tentukan.
- predicted_impact (string): Prediksi dampak nyata jangka pendek (1-3 hari ke depan) dan jangka menengah (1-2 minggu ke depan) terhadap ketertiban sosial-keamanan masyarakat di wilayah tersebut jika tidak ada intervensi cepat.`;

      const userPrompt = `Isu EWS yang akan dianalisis:
=========================================
Judul Isu: ${issue.title}
Deskripsi/Kronologi: ${issue.description}
Sumber Pendukung:
${Array.isArray(issue.sources) ? issue.sources.map(s => `- ${s.source_name}: ${s.url}`).join('\n') : ''}
Hasil Evaluasi Kredibilitas: KREDIBEL (Skor: ${issue.verificationScore})
Catatan Verifikasi: ${issue.verificationNotes}
=========================================`;

      const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      console.log(`[Tahap 3 - Deep Analysis] Menganalisis dampak Isu ID: ${issueId} menggunakan OpenAI (${modelName})...`);

      const completion = await this.openai.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'deep_analysis_response',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                risk_level: {
                  type: 'string',
                  description: 'Tingkat risiko isu (AMAN, WASPADA, atau KRITIS/MERAH).'
                },
                primary_category: {
                  type: 'string',
                  description: 'Kategori utama bidang isu.'
                },
                target_district: {
                  type: 'string',
                  description: 'Distrik terdampak di Mimika.'
                },
                analysis_summary: {
                  type: 'string',
                  description: 'Rangkuman analisis dinamika konflik.'
                },
                predicted_impact: {
                  type: 'string',
                  description: 'Prediksi dampak sosial-keamanan.'
                }
              },
              required: ['risk_level', 'primary_category', 'target_district', 'analysis_summary', 'predicted_impact'],
              additionalProperties: false
            }
          }
        }
      });

      const parsedResponse = JSON.parse(completion.choices[0].message.content);
      console.log(`[Tahap 3 - Deep Analysis] Hasil: risk_level=${parsedResponse.risk_level}, district=${parsedResponse.target_district}`);
      return parsedResponse;

    } catch (error) {
      console.error('[AiService] Gagal menganalisis dampak mendalam:', error);
      throw new Error(`Gagal menganalisis dampak isu: ${error.message}`);
    }
  }

  /**
   * TAHAP 4: Mitigasi & Rekomendasi OPD
   * Merancang rekomendasi rencana aksi mitigasi konkret dan mengidentifikasi OPD penanggung jawab.
   * @param {string} issueId - ID isu yang akan dimitigasi
   * @returns {Promise<Object>} - Rencana mitigasi { mitigation_actions, responsible_opd }
   */
  async generateMitigationRecommendations(issueId) {
    try {
      // 1. Tarik data isu dari database
      const issue = await prisma.ewsIssue.findUnique({
        where: { id: issueId }
      });

      if (!issue) {
        throw new Error(`Isu dengan ID ${issueId} tidak ditemukan.`);
      }

      // 2. Tarik baseline kondisi normal daerah
      const baselines = await prisma.systemBaseline.findMany();

      const formattedBaselines = baselines.map((b, idx) => {
        return `Baseline ${idx + 1} (${b.category}):
- Kondisi Normal: ${b.baselineValue}
- Deskripsi: ${b.description}`;
      }).join('\n\n');

      const systemPrompt = `Anda adalah Asisten Analis EWS (Early Warning System) BRIDA Kabupaten Mimika.
Tugas Anda adalah menyusun rencana aksi mitigasi taktis-operasional yang konkret dan mengidentifikasi OPD (Organisasi Perangkat Daerah) Kabupaten Mimika yang bertanggung jawab untuk menangani isu kerawanan sosial-keamanan yang terdeteksi.

Berikut adalah Baseline Kondisi Normal Kabupaten Mimika:
=========================================
${formattedBaselines}
=========================================

Aturan Merancang Mitigasi:
1. Tindakan Konkret & Taktis: Tindakan harus operasional dan dapat dieksekusi secara nyata di wilayah Mimika (seperti: "Penyaluran beras bantuan pangan darurat ke distrik terdampak", "Patroli pengamanan gabungan Polres & Satpol PP di Kwamki Narama", "Mediasi adat antara tokoh suku oleh Kesbangpol", "Operasi pasar murah untuk menstabilkan harga bahan pokok").
2. Relevansi Wilayah & Isu: Sesuaikan langkah mitigasi dengan kategori ancaman dan distrik terdampak.
3. Kuantitas Rencana: Berikan minimal 3 dan maksimal 6 poin tindakan mitigasi yang berurutan secara logis (mis. jangka pendek/segera, hingga jangka menengah).
4. Penentuan OPD: Rekomendasikan nama-nama dinas daerah (OPD) di Pemkab Mimika yang bertanggung jawab memimpin/mengeksekusi tindakan tersebut (contoh: Satpol PP, Badan Kesbangpol, Dinas Sosial, Dinas Perindustrian dan Perdagangan, Dinas Ketahanan Pangan, dll).

Aturan Output:
- mitigation_actions (array of strings): Daftar 3 s.d. 6 langkah aksi mitigasi taktis operasional.
- responsible_opd (string): Nama OPD penanggung jawab utama (contoh: "Badan Kesbangpol Kabupaten Mimika dan Satpol PP, berkoordinasi dengan Polres Mimika").`;

      const userPrompt = `Isu EWS yang akan dimitigasi:
=========================================
Judul Isu: ${issue.title}
Deskripsi/Kronologi: ${issue.description}
Kategori Isu: ${issue.primaryCategory}
Wilayah Dampak (Distrik): ${issue.targetDistrict}
Tingkat Risiko: ${issue.riskLevel}

Analisis Dampak AI:
${issue.analysisSummary}

Prediksi Dampak Sosial-Keamanan:
${issue.predictedImpact}
=========================================`;

      const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      console.log(`[Tahap 4 - Mitigation Planning] Merancang rencana aksi mitigasi Isu ID: ${issueId} menggunakan OpenAI (${modelName})...`);

      const completion = await this.openai.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'mitigation_response',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                mitigation_actions: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Daftar langkah aksi mitigasi konkret.'
                },
                responsible_opd: {
                  type: 'string',
                  description: 'Nama OPD penanggung jawab utama.'
                }
              },
              required: ['mitigation_actions', 'responsible_opd'],
              additionalProperties: false
            }
          }
        }
      });

      const parsedResponse = JSON.parse(completion.choices[0].message.content);
      console.log(`[Tahap 4 - Mitigation Planning] Hasil: OPD=${parsedResponse.responsible_opd}, actionsCount=${parsedResponse.mitigation_actions.length}`);
      return parsedResponse;

    } catch (error) {
      console.error('[AiService] Gagal merancang rencana mitigasi:', error);
      throw new Error(`Gagal merancang rencana mitigasi: ${error.message}`);
    }
  }
}

export default new AiService();
