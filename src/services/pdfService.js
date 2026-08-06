import PDFDocument from 'pdfkit';

/**
 * Service to generate official BRIDA Kabupaten Mimika EWS PDF Reports
 */
class PdfService {
  /**
   * Generates EWS report PDF and pipes it to the HTTP response
   * @param {Object} analysis - The EWS Analysis database record
   * @param {Object} res - Express response stream
   */
  generateEwsReport(analysis, res) {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 54, bottom: 54, left: 72, right: 72 } // 1 inch top/bottom, 1.25 inch sides for formal layout
    });

    // Pipe PDF document to express response
    doc.pipe(res);

    // KOP SURAT (Government Header)
    doc.fontSize(14).font('Helvetica-Bold').text('PEMERINTAH KABUPATEN MIMIKA', { align: 'center' });
    doc.fontSize(16).text('BADAN RISET DAN INOVASI DAERAH (BRIDA)', { align: 'center' });
    doc.fontSize(10).font('Helvetica-Oblique').text('Jalan Sentral Pemerintahan SP 3, Kuala Kencana, Timika, Papua Tengah', { align: 'center' });
    
    // Draw Header Line
    doc.moveDown(0.5);
    doc.lineWidth(2).moveTo(54, doc.y).lineTo(540, doc.y).stroke();
    doc.moveDown(0.2);
    doc.lineWidth(0.5).moveTo(54, doc.y).lineTo(540, doc.y).stroke();
    
    doc.moveDown(2);

    // Document Title
    doc.fontSize(12).font('Helvetica-Bold').text('LAPORAN EARLY WARNING SYSTEM (EWS) DAERAH', { align: 'center' });
    doc.fontSize(11).text(`NOMOR BATCH: ${analysis.batchId}`, { align: 'center' });
    doc.moveDown(1.5);

    // Metadata Table / Key-Values
    const startY = doc.y;
    doc.fontSize(10).font('Helvetica-Bold').text('INFORMASI LAPORAN:', 54);
    doc.moveDown(0.5);
    
    doc.font('Helvetica-Bold').text('Tanggal Laporan', 54);
    doc.font('Helvetica').text(`: ${new Date(analysis.createdAt).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })} WIB`, 160);
    doc.moveDown(0.4);

    doc.font('Helvetica-Bold').text('Tingkat Kerawanan', 54);
    let riskText = analysis.riskLevel;
    if (analysis.riskLevel === 'KRITIS/MERAH') {
      doc.fillColor('red').font('Helvetica-Bold').text(`: ${riskText} (Perlu Tindakan Segera)`, 160).fillColor('black');
    } else if (analysis.riskLevel === 'WASPADA') {
      doc.fillColor('orange').font('Helvetica-Bold').text(`: ${riskText}`, 160).fillColor('black');
    } else {
      doc.fillColor('green').font('Helvetica-Bold').text(`: ${riskText}`, 160).fillColor('black');
    }
    doc.moveDown(0.4);

    doc.font('Helvetica-Bold').text('Kategori Isu', 54);
    doc.font('Helvetica').text(`: ${analysis.primaryCategory}`, 160);
    doc.moveDown(0.4);

    doc.font('Helvetica-Bold').text('Wilayah Terdampak', 54);
    doc.font('Helvetica').text(`: Distrik ${analysis.targetDistrict}`, 160);
    doc.moveDown(0.4);

    doc.font('Helvetica-Bold').text('OPD Penanggung Jawab', 54);
    doc.font('Helvetica').text(`: ${analysis.responsibleOpd || 'Belum Ditentukan'}`, 160);
    
    doc.moveDown(1.5);
    doc.lineWidth(1).moveTo(54, doc.y).lineTo(540, doc.y).stroke();
    doc.moveDown(1);

    // Summary Section
    doc.fontSize(11).font('Helvetica-Bold').text('1. Ringkasan Eksekutif Isu');
    doc.fontSize(10).font('Helvetica').text(analysis.summary, {
      align: 'justify',
      lineGap: 3
    });
    doc.moveDown(1.5);

    // Predicted Impact Section
    doc.fontSize(11).font('Helvetica-Bold').text('2. Analisis Dampak Terhadap RKPD / Kebijakan Daerah');
    doc.fontSize(10).font('Helvetica').text(analysis.predictedImpact, {
      align: 'justify',
      lineGap: 3
    });
    doc.moveDown(1.5);

    // Recommendations Section
    doc.fontSize(11).font('Helvetica-Bold').text('3. Rekomendasi Aksi & Langkah Mitigasi Dinas');
    doc.moveDown(0.5);

    const actions = analysis.recommendedActions || [];
    if (actions.length === 0) {
      doc.fontSize(10).font('Helvetica').text('- Belum ada rekomendasi aksi yang di-generate. Silakan jalankan Fase Rekomendasi terlebih dahulu.');
    } else {
      actions.forEach((action, idx) => {
        doc.fontSize(10).font('Helvetica-Bold').text(`${idx + 1}.`, 54);
        doc.fontSize(10).font('Helvetica').text(action, 72, doc.y - 12, {
          width: 468,
          align: 'justify',
          lineGap: 2
        });
        doc.moveDown(0.5);
      });
    }

    doc.moveDown(2);

    // Sign-off / Signature section
    const currentY = doc.y;
    if (currentY > 700) {
      doc.addPage(); // Avoid signature overflowing to a weird spot
    }
    
    const signatureY = doc.y + 30;
    doc.fontSize(10).font('Helvetica').text('Timika, ' + new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }), 320, signatureY, { align: 'center' });
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('Kepala Badan Riset dan Inovasi Daerah', 320, doc.y, { align: 'center' });
    doc.font('Helvetica-Bold').text('Kabupaten Mimika', 320, doc.y, { align: 'center' });
    
    doc.moveDown(4); // Space for actual handwritten signature
    
    doc.font('Helvetica-Bold').text('__________________________________', 320, doc.y, { align: 'center' });
    doc.fontSize(9).font('Helvetica').text('NIP. 19780512 200501 1 002', 320, doc.y + 5, { align: 'center' });

    // End Document
    doc.end();
  }

  /**
   * Generates a customized EWS report PDF from database record and pipes it to the HTTP response
   * @param {Object} report - The EwsReport database record (includes Issue relation)
   * @param {Object} res - Express response stream
   */
  generateCustomReportPdf(report, res) {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 54, bottom: 54, left: 72, right: 72 }
    });

    doc.pipe(res);

    // KOP SURAT (Government Header)
    doc.fontSize(14).font('Helvetica-Bold').text('PEMERINTAH KABUPATEN MIMIKA', { align: 'center' });
    doc.fontSize(16).text('BADAN RISET DAN INOVASI DAERAH (BRIDA)', { align: 'center' });
    doc.fontSize(10).font('Helvetica-Oblique').text('Jalan Sentral Pemerintahan SP 3, Kuala Kencana, Timika, Papua Tengah', { align: 'center' });
    
    // Draw Header Line
    doc.moveDown(0.5);
    doc.lineWidth(2).moveTo(54, doc.y).lineTo(540, doc.y).stroke();
    doc.moveDown(0.2);
    doc.lineWidth(0.5).moveTo(54, doc.y).lineTo(540, doc.y).stroke();
    
    doc.moveDown(2);

    // Document Title
    doc.fontSize(12).font('Helvetica-Bold').text(report.title.toUpperCase(), { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(`ID Laporan: ${report.id}`, { align: 'center' });
    doc.moveDown(1.5);

    // Metadata Table / Key-Values
    doc.fontSize(10).font('Helvetica-Bold').text('METADATA ISU RUJUKAN:', 54);
    doc.moveDown(0.5);
    
    doc.font('Helvetica-Bold').text('Tanggal Cetak', 54);
    doc.font('Helvetica').text(`: ${new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })} WIT`, 160);
    doc.moveDown(0.4);

    doc.font('Helvetica-Bold').text('Penyusun Laporan', 54);
    doc.font('Helvetica').text(`: ${report.author}`, 160);
    doc.moveDown(0.4);

    doc.font('Helvetica-Bold').text('Isu Rujukan', 54);
    doc.font('Helvetica').text(`: ${report.Issue?.title || 'Isu Tidak Ditemukan'}`, 160);
    doc.moveDown(0.4);

    doc.font('Helvetica-Bold').text('Kategori / Wilayah', 54);
    doc.font('Helvetica').text(`: ${report.Issue?.primaryCategory || '-'} / Distrik ${report.Issue?.targetDistrict || '-'}`, 160);
    
    doc.moveDown(1.5);
    doc.lineWidth(1).moveTo(54, doc.y).lineTo(540, doc.y).stroke();
    doc.moveDown(1.5);

    // Report Content (split by newlines to print paragraph by paragraph)
    doc.fontSize(11).font('Helvetica-Bold').text('ISI LAPORAN KEWASPADAAN DINI:');
    doc.moveDown(0.5);

    const paragraphs = report.content.split('\n');
    paragraphs.forEach(para => {
      const cleanPara = para.trim();
      if (cleanPara.length === 0) {
        doc.moveDown(0.5);
      } else {
        // Check if paragraph is a heading/bullet or general paragraph
        if (cleanPara.startsWith('I.') || cleanPara.startsWith('II.') || cleanPara.startsWith('III.') || cleanPara.startsWith('IV.') || cleanPara.startsWith('V.')) {
          doc.moveDown(0.5);
          doc.fontSize(10).font('Helvetica-Bold').text(cleanPara, { lineGap: 3 });
          doc.moveDown(0.2);
        } else {
          doc.fontSize(10).font('Helvetica').text(cleanPara, {
            align: 'justify',
            lineGap: 3
          });
          doc.moveDown(0.4);
        }
      }
    });

    doc.moveDown(2);

    // Sign-off / Signature section
    const currentY = doc.y;
    if (currentY > 700) {
      doc.addPage();
    }
    
    const signatureY = doc.y + 30;
    doc.fontSize(10).font('Helvetica').text('Timika, ' + new Date(report.createdAt).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }), 320, signatureY, { align: 'center' });
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('Kepala Badan Riset dan Inovasi Daerah', 320, doc.y, { align: 'center' });
    doc.font('Helvetica-Bold').text('Kabupaten Mimika', 320, doc.y, { align: 'center' });
    
    doc.moveDown(4); // Space for signature
    
    doc.font('Helvetica-Bold').text('__________________________________', 320, doc.y, { align: 'center' });
    doc.fontSize(9).font('Helvetica').text('NIP. 19780512 200501 1 002', 320, doc.y + 5, { align: 'center' });

    doc.end();
  }
}

export default new PdfService();
