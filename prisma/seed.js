import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding system baselines for Mimika EWS...');

  const baselines = [
    {
      category: 'Keamanan & Konflik Suku',
      baselineValue: 'Normal: Kerukunan antar suku asli (Amungme, Kamoro) serta paguyuban pendatang terjalin harmonis di Mimika. Tidak ada gesekan sosial, tidak ada mobilisasi massa bersenjata tradisional (busur/panah), dan situasi kamtibmas di pemukiman kondusif.',
      description: 'Acuan stabilitas sosial, toleransi, dan ketertiban umum masyarakat Mimika.'
    },
    {
      category: 'Infrastruktur & Akses Jalan',
      baselineValue: 'Normal: Akses transportasi udara (Bandara Mozes Kilangin), laut (Pelabuhan Poumako), dan darat (Jalan Trans-Timika, Jalan Poros Kuala Kencana) berjalan lancar setiap hari. Tidak ada aksi blokade jalan, pemalangan fasilitas umum, atau sabotase jalur logistik.',
      description: 'Acuan konektivitas wilayah dan kelancaran distribusi logistik daerah.'
    },
    {
      category: 'Ketahanan Energi (BBM)',
      baselineValue: 'Normal: Pasokan dan penyaluran BBM bersubsidi (Solar & Pertalite) serta LPG tercukupi tanpa adanya antrean kendaraan yang mengular di SPBU Timika (SPBU Jalan Komodo, SPBU SP 2, SPBU SP 3) lebih dari 1 hari. Tidak ada penimbunan atau kelangkaan di tingkat pengecer.',
      description: 'Acuan kelancaran pasokan energi dan stabilitas bahan bakar daerah.'
    },
    {
      category: 'Ketahanan Pangan & Ekonomi Rakyat',
      baselineValue: 'Normal: Harga bahan pokok (beras, minyak goreng, sagu, umbi-umbian, cabai, ayam) di Pasar Sentral Timika stabil. Pasokan bahan makanan mengalir lancar dari pelabuhan, inflasi terkendali di bawah ambang batas yang ditetapkan Tim Pengendalian Inflasi Daerah (TPID).',
      description: 'Acuan stabilitas ekonomi makro dan harga kebutuhan hidup masyarakat Mimika.'
    },
    {
      category: 'Hak Adat & Tanah Ulayat',
      baselineValue: 'Normal: Sengketa lahan atau hak ulayat diselesaikan dengan damai melalui musyawarah adat yang difasilitasi oleh LEMASA (Amungme) dan LEMASKO (Kamoro) bersama Pemda. Tidak ada penutupan paksa lahan pembangunan (pemalangan adat) secara sepihak oleh pemilik ulayat.',
      description: 'Acuan regulasi konflik pertanahan, hak adat suku asli Mimika.'
    },
    {
      category: 'Pelayanan Birokrasi & Pelayanan Publik',
      baselineValue: 'Normal: Kantor-kantor Organisasi Perangkat Daerah (OPD) di Pusat Pemerintahan SP 3, puskesmas, dan sekolah dasar beroperasi normal setiap hari kerja. Tidak ada mogok kerja massal oleh ASN, demonstrasi anarkis pegawai, atau penyegelan gedung dinas.',
      description: 'Acuan kelancaran administrasi pemerintahan dan pelayanan dasar publik.'
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
