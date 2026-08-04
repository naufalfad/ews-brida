import { createRequire } from 'module';
import OpenAI from 'openai';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

/**
 * Service to process and extract EWS baselines from TXT, PDF, and Images
 */
class BaselineService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Main entry point to extract raw text from an uploaded file buffer
   * @param {Object} file - Express multer file object
   * @returns {Promise<string>} - Extracted raw text
   */
  async extractTextFromFile(file) {
    const mimeType = file.mimetype;
    
    if (mimeType === 'text/plain') {
      // 1. Text File
      console.log(`[BaselineService] Membaca teks mentah dari file TXT: ${file.originalname}`);
      return file.buffer.toString('utf-8');
    } 
    
    else if (mimeType === 'application/pdf') {
      // 2. PDF File
      console.log(`[BaselineService] Mengekstrak teks dari file PDF: ${file.originalname}`);
      const parsed = await pdfParse(file.buffer);
      return parsed.text;
    } 
    
    else if (mimeType.startsWith('image/')) {
      // 3. Image file (PNG, JPG, JPEG) using OpenAI Vision API
      console.log(`[BaselineService] Menggunakan OpenAI Vision untuk membaca gambar: ${file.originalname}`);
      
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY tidak dikonfigurasi untuk Vision API.');
      }

      const base64Image = file.buffer.toString('base64');
      const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';

      const response = await this.openai.chat.completions.create({
        model: modelName,
        messages: [
          {
            role: 'user',
            content: [
              { 
                type: 'text', 
                text: 'Ekstrak dan salin seluruh teks peraturan, kebijakan pemerintah, lembaran daerah, atau informasi berita dari gambar dokumen ini secara utuh dalam Bahasa Indonesia.' 
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`
                }
              }
            ]
          }
        ]
      });

      const extractedText = response.choices[0].message.content;
      return extractedText;
    } 
    
    else {
      throw new Error(`Tipe file '${mimeType}' tidak didukung. Harap unggah file TXT, PDF, atau Gambar (JPG/PNG).`);
    }
  }

  /**
   * Structure any raw text into system baseline JSON formats using OpenAI Structured Outputs
   * @param {string} rawText - The text to structure
   * @param {string} sourceName - The source file name for provenance details
   * @returns {Promise<Array>} - Array of structured baseline objects
   */
  async structureTextToBaselines(rawText, sourceName) {
    if (!rawText || rawText.trim().length === 0) {
      throw new Error('Teks kosong, tidak ada data untuk distrukturkan.');
    }

    const systemPrompt = `Anda adalah Asisten Kebijakan Publik BRIDA Kabupaten Mimika.
Tugas Anda adalah merangkum dan menstrukturkan dokumen kebijakan, RKPD, target pemerintah daerah, atau kabar kestabilan wilayah ke dalam daftar "System Baseline" acuan EWS (Early Warning System).

Setiap baseline harus memiliki parameter:
- "category": Kategori bidang isu yang tepat (contoh: "Stabilitas Politik & Keamanan", "Ekonomi & Energi", "Hak Ulayat & Adat", "Infrastruktur", "Layanan Publik").
- "baselineValue": Penjelasan detail mengenai kondisi ideal, acuan normal, peraturan daerah, atau program pemerintah daerah Mimika.
- "description": Tambahkan detail sumber dokumen (contoh: "Diambil dari dokumen ${sourceName}").`;

    const userPrompt = `Teks Dokumen Mentah:
-------------------------
${rawText}
-------------------------

Strukturkan teks tersebut ke dalam daftar baseline yang valid.`;

    try {
      const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      console.log(`[BaselineService] Menstrukturkan teks baseline menggunakan OpenAI (${modelName})...`);

      const completion = await this.openai.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'baselines_response',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                baselines: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      category: {
                        type: 'string',
                        description: 'Kategori baseline (maksimal 100 karakter)'
                      },
                      baselineValue: {
                        type: 'string',
                        description: 'Deskripsi acuan aman / target kebijakan pemerintah Mimika secara konkret.'
                      },
                      description: {
                        type: 'string',
                        description: 'Penjelasan tambahan atau sumber dokumen.'
                      }
                    },
                    required: ['category', 'baselineValue', 'description'],
                    additionalProperties: false
                  }
                }
              },
              required: ['baselines'],
              additionalProperties: false
            }
          }
        }
      });

      const parsed = JSON.parse(completion.choices[0].message.content);
      return parsed.baselines;
    } catch (error) {
      console.error('[BaselineService] Gagal menstrukturkan baseline:', error);
      throw new Error(`Gagal menstrukturkan baseline: ${error.message}`);
    }
  }
}

export default new BaselineService();
