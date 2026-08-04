import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ExternalEmbeddingAdapter } from '../../document-ingestion/providers/external-embedding.adapter';
import { DocumentRepository } from '../../document-ingestion/repositories/document.repository';
import { RetrievalResult } from '../interfaces/retrieval-result.interface';

export interface RetrievalSearchOptions {
  documentId: string;
  queryText: string;
  topK?: number;
  similarityThreshold?: number;
  districts?: string[];
}

@Injectable()
export class VectorRetrievalService {
  private readonly logger = new Logger(VectorRetrievalService.name);

  constructor(
    private readonly embeddingAdapter: ExternalEmbeddingAdapter,
    private readonly repository: DocumentRepository,
  ) {}

  async searchRelevantChunks(options: RetrievalSearchOptions): Promise<RetrievalResult[]> {
    const { documentId, queryText, topK = 10, similarityThreshold = 0.5 } = options;

    if (!queryText || queryText.trim().length === 0) {
      return [];
    }

    // 1. Check if document exists
    const doc = await this.repository.findById(documentId);
    if (!doc) {
      throw new NotFoundException(`Dokumen laporan dengan ID '${documentId}' tidak ditemukan.`);
    }

    // 2. Convert query text to query vector embedding
    const queryVectors = await this.embeddingAdapter.generateEmbeddings([queryText]);
    const queryVector = queryVectors[0];

    // 3. Execute Vector Retrieval via DocumentRepository (Cosine Similarity <=> in pgvector)
    const results = await this.repository.findSimilarChunks({
      documentId,
      queryVector,
      limit: topK,
      similarityThreshold,
      queryText,
      districts: options.districts,
    });

    this.logger.log(
      `[VectorRetrievalService] Kueri: "${queryText.slice(0, 50)}..." -> Ditemukan ${results.length} chunks relevan di Dokumen ID ${documentId}.`,
    );

    return results;
  }
}
