import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding system baselines...');

  const baselines = [
    {
      category: 'RKPD - Peningkatan Infrastruktur dan Konektivitas Wilayah',
      baselineValue: 'Normal: Pembangunan jalan raya, jembatan, pelabuhan Poumako, dan operasional Bandara Mozes Kilangin berjalan tanpa hambatan konflik sosial atau pemblokiran ulayat. Distribusi logistik ke sub-distrik pedalaman berjalan lancar setiap minggu tanpa penutupan jalan trans-timika.',
      description: 'Kebijakan dan target pemerintah daerah Kabupaten Mimika untuk konektivitas transportasi dan infrastruktur.',
    },
    {
      category: 'RKPD - Stabilitas Keamanan, Ketertiban Umum dan Forkopimda',
      baselineValue: 'Normal: Kondisi aman dicirikan dengan kerukunan antar suku (suku asli Amungme & Kamoro serta paguyuban pendatang). Hubungan Forkopimda solid, patroli keamanan aktif, tidak ada aksi anarkis di depan kantor bupati/pemerintah daerah, dan tidak ada gangguan keamanan bersenjata di wilayah pemukiman/tambang.',
      description: 'Kebijakan Bupati dan Forkopimda Mimika dalam menjaga stabilitas keamanan daerah.',
    },
    {
      category: 'RKPD - Stabilitas Pangan, Energi dan Ekonomi Kerakyatan',
      baselineValue: 'Normal: Inflasi daerah terkendali, harga bahan pokok di Pasar Sentral Timika stabil. Pasokan energi (BBM penugasan/subsidi) tercukupi tanpa adanya antrean kendaraan yang mengular di SPBU Timika lebih dari 1 hari.',
      description: 'Kebijakan Bupati terkait ketahanan pangan, pengendalian inflasi, dan pemenuhan kebutuhan energi masyarakat.',
    },
    {
      category: 'RKPD - Kualitas Birokrasi dan Pelayanan Publik',
      baselineValue: 'Normal: Seluruh Organisasi Perangkat Daerah (OPD) di Pusat Pemerintahan SP 3 bekerja normal melayani publik. Tidak ada pemblokiran kantor dinas akibat sengketa jabatan atau hak tanah adat, serta pelayanan kesehatan dan pendidikan dasar berjalan penuh.',
      description: 'Acuan tata kelola pemerintahan daerah, stabilitas ASN, dan kelancaran pelayanan dasar di Mimika.',
    }
  ];

  for (const baseline of baselines) {
    await prisma.systemBaseline.upsert({
      where: { category: baseline.category },
      update: {
        baselineValue: baseline.baselineValue,
        description: baseline.description,
      },
      create: {
        category: baseline.category,
        baselineValue: baseline.baselineValue,
        description: baseline.description,
      },
    });
  }

  console.log('Seeding sample raw articles...');

  const sampleArticles = [
    {
      sourceName: 'Radar Timika',
      sourceType: 'Media Lokal',
      title: 'FKUB Mimika Gelar Pertemuan Rutin Bahas Kerukunan Menjelang Pilkada',
      content: 'TIMIKA - Forum Kerukunan Umat Beragama (FKUB) Kabupaten Mimika menggelar pertemuan rutin di salah satu hotel di Timika. Pertemuan ini dihadiri oleh tokoh-tokoh agama untuk memastikan situasi keamanan dan toleransi tetap terjaga menjelang tahapan Pilkada 2026. Ketua FKUB mengimbau agar seluruh masyarakat tidak mudah terprovokasi oleh berita-berita hoaks yang beredar di media sosial.',
      url: 'https://radartimika.co.id/fkub-mimika-gelar-pertemuan-rutin-pilkada',
      publishedAt: new Date(),
    },
    {
      sourceName: 'Laporan Warga Mimika Baru',
      sourceType: 'Media Sosial',
      title: 'Antrean Panjang Kendaraan di SPBU Jalan Komodo Timika Kembali Terjadi',
      content: 'Dilaporkan adanya antrean panjang kendaraan roda empat dan roda dua di SPBU Jalan Komodo, Mimika Baru sejak pagi ini pukul 07.00 WIT. Beberapa sopir truk mengeluhkan sulitnya mendapatkan solar bersubsidi selama 3 hari terakhir. Sebagian berspekulasi adanya keterlambatan pasokan dari pelabuhan Poumako.',
      url: 'https://facebook.com/groups/infotimika/posts/992839218',
      publishedAt: new Date(Date.now() - 3600000 * 2), // 2 hours ago
    },
    {
      sourceName: 'Mimika Info',
      sourceType: 'Media Lokal',
      title: 'Aksi Unjuk Rasa Damai Sekelompok Pemuda Terkait Hak Ulayat di Depan Kantor Bupati Mimika',
      content: 'TIMIKA - Puluhan pemuda melakukan aksi unjuk rasa damai di depan Kantor Pusat Pemerintahan Kabupaten Mimika, SP 3. Mereka menuntut kejelasan ganti rugi pemanfaatan lahan ulayat untuk pembangunan fasilitas umum. Aksi berjalan tertib dengan pengawalan dari Satpol PP dan kepolisian setempat. Perwakilan pengunjuk rasa diterima oleh Asisten Setda untuk mediasi lanjutan.',
      url: 'https://mimikainfo.com/unjuk-rasa-damai-hak-ulayat-kantor-bupati',
      publishedAt: new Date(Date.now() - 3600000 * 5), // 5 hours ago
    }
  ];

  for (const article of sampleArticles) {
    // Check if article with same title exists, if not, create it
    const existing = await prisma.rawArticle.findFirst({
      where: { title: article.title }
    });
    if (!existing) {
      await prisma.rawArticle.create({
        data: article
      });
    }
  }

  console.log('Seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
