import prisma from '../config/prisma.js';

export async function assembleContextForTriangulation() {
  // 1. Ambil artikel mentah terbaru dari database RawArticle
  const rawArticles = await prisma.rawArticle.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20
  });

  // 2. Ambil seluruh data baseline aktif
  const baselines = await prisma.systemBaseline.findMany();

  return {
    rawArticles,
    baselines
  };
}
