import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding system baselines for Mimika EWS...');

  const baselines = [
    {
      category: 'Keamanan & Konflik Suku',
      baselineValue: 'Normal: Kerukunan antar suku asli (Amungme, Kamoro) serta paguyuban pendatang terjalin harmonis di Mimika. Tidak ada gesekan sosial, tidak ada mobilisasi massa bersenjata tradisional (busur/panah), dan situasi kamtibmas di pemukiman kondusif. Aksi demonstrasi politik harus memiliki izin resmi Polres Mimika dan berlangsung damai. Tidak ada seruan boikot agenda nasional (seperti HUT RI atau Pemilu) serta tidak ada gangguan keamanan oleh kelompok sipil bersenjata (KKB/OPM) di wilayah perkotaan maupun pedalaman Mimika.',
      description: 'Acuan stabilitas sosial, keamanan nasional, toleransi, dan ketertiban umum masyarakat Mimika.'
    },
    {
      category: 'Infrastruktur & Akses Jalan',
      baselineValue: 'Normal: Akses transportasi udara (Bandara Mozes Kilangin), laut (Pelabuhan Poumako), dan darat (Jalan Trans-Timika, Jalan Poros Kuala Kencana - SP 3) berjalan lancar setiap hari. Tidak ada aksi blokade jalan, pemalangan fasilitas umum, sabotase jalur logistik, atau penutupan paksa jalan operasi tambang PT Freeport Indonesia (seperti Checkpoint 28, Mile 21, Mile 50).',
      description: 'Acuan konektivitas wilayah, kelancaran distribusi logistik, dan keamanan objek vital nasional.'
    },
    {
      category: 'Ketahanan Energi (BBM)',
      baselineValue: 'Normal: Pasokan dan penyaluran BBM bersubsidi (Solar & Pertalite) serta LPG tercukupi dengan penerapan kebijakan kartu kendali ganjil-genap untuk solar subsidi secara tertib. Antrean kendaraan di SPBU Timika (SPBU Jalan Komodo, SPBU SP 2, SPBU SP 3) berlangsung wajar (di bawah 1 jam) dan tidak menimbulkan kemacetan lalu lintas. Tidak ada aktivitas penimbunan BBM bersubsidi (pengetap ilegal) atau kelangkaan akut di tingkat pengecer.',
      description: 'Acuan kelancaran pasokan energi, kepatuhan regulasi ganjil-genap solar, dan stabilitas bahan bakar daerah.'
    },
    {
      category: 'Ketahanan Pangan & Ekonomi Rakyat',
      baselineValue: 'Normal: Harga bahan pokok (beras, minyak goreng, sagu, umbi-umbian, cabai, ayam) di Pasar Sentral Timika stabil. Pasokan bahan makanan dari luar daerah mengalir lancar melalui Pelabuhan Poumako. Khusus untuk distrik pegunungan/terisolir (seperti Alama, Jila, Bela), logistik pangan terkirim secara berkala melalui penerbangan perintis terjadwal tanpa ada hambatan cuaca atau gangguan keamanan. Inflasi daerah terkendali di bawah ambang batas yang ditetapkan Tim Pengendalian Inflasi Daerah (TPID).',
      description: 'Acuan stabilitas harga pangan pasar kota, kelancaran logistik udara distrik terpencil, dan ketahanan pangan Mimika.'
    },
    {
      category: 'Hak Adat & Tanah Ulayat',
      baselineValue: 'Normal: Sengketa lahan pembangunan atau hak ulayat diselesaikan secara kekeluargaan melalui musyawarah adat yang difasilitasi oleh LEMASA (Lembaga Musyawarah Adat Suku Amungme) dan LEMASKO (Lembaga Musyawarah Adat Suku Kamoro) bersama Pemda Mimika. Tidak ada tindakan pemalangan adat (penutupan paksa proyek pembangunan pemerintah atau fasilitas umum) secara sepihak oleh pemilik ulayat.',
      description: 'Acuan sengketa ulayat/pertanahan, hak adat suku asli Mimika, dan peran lembaga adat lokal.'
    },
    {
      category: 'Pelayanan Birokrasi & Pelayanan Publik',
      baselineValue: 'Normal: Kantor-kantor Organisasi Perangkat Daerah (OPD) di Pusat Pemerintahan SP 3, rumah sakit (RSUD Mimika), puskesmas, dan sekolah dasar beroperasi normal setiap hari kerja. Pelayanan publik berjalan tanpa adanya pemogokan kerja massal oleh aparatur sipil negara (ASN) atau aksi penyegelan gedung kantor dinas oleh kelompok tertentu.',
      description: 'Acuan kelancaran administrasi pemerintahan, pelayanan dasar publik, dan keberlangsungan pemerintahan daerah.'
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

  console.log('Seeding system baselines completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
