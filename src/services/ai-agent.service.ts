import {
  Injectable,
  Logger,
  RequestTimeoutException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ContextAssemblyService } from './context-assembly.service';
import { VendorLlmAdapter } from '../providers/vendor-llm.adapter';
import { ANALYSIS_OUTPUT_JSON_SCHEMA } from '../schemas/analysis-output.schema';
import { AnalysisResponseDto } from '../schemas/analysis-response.dto';
import { AnalysisRequestDto } from '../dtos/analysis-request.dto';
import { FinalAnalysisResponse } from '../dtos/analysis-response.dto';
import { LogStatus } from '@prisma/client';

@Injectable()
export class AiAgentService {
  private readonly logger = new Logger(AiAgentService.name);

  // Circuit Breaker / Timeout Guard (60,000 ms = 60s)
  private readonly CIRCUIT_BREAKER_TIMEOUT_MS = 60000;

  constructor(
    private readonly contextAssembly: ContextAssemblyService,
    private readonly llmAdapter: VendorLlmAdapter,
    private readonly prisma: PrismaService,
  ) {}

  async executeStaticAnalysis(dto: AnalysisRequestDto): Promise<FinalAnalysisResponse> {
    const startTime = Date.now();

    try {
      // 1. Race execution against Circuit Breaker Timeout Guard
      const result = await Promise.race([
        this.runAnalysisPipeline(dto, startTime),
        this.createTimeoutGuard(this.CIRCUIT_BREAKER_TIMEOUT_MS),
      ]);

      return result as FinalAnalysisResponse;
    } catch (error: any) {
      const executionTimeMs = Date.now() - startTime;
      this.logger.error(
        `[AiAgentService Failed] Dokumen ID '${dto.documentId}': ${error.message}`,
      );

      // Async Audit Trail Failure Logging
      await this.saveAuditLog({
        documentId: dto.documentId,
        userQuery: dto.query,
        status: LogStatus.ERROR,
        errorMessage: error.message,
        executionTimeMs,
      });

      if (error instanceof RequestTimeoutException) {
        throw error;
      }

      throw new InternalServerErrorException(
        `Gagal memproses analisis AI: ${error.message || 'Kesalahan internal server.'}`,
      );
    }
  }

  private async runAnalysisPipeline(
    dto: AnalysisRequestDto,
    startTime: number,
  ): Promise<FinalAnalysisResponse> {
    // Step A: Assemble Quad-Block Prompt Payload (Context Assembly Layer - Phase 2.2)
    const promptPayload = await this.contextAssembly.assemblePromptPayload({
      documentIds: [dto.documentId],
      userQuery: dto.query,
    });

    // Step B: Call LLM Adapter with JSON Schema Enforcement & Resilience (Phase 2.3)
    const structuredAnalysis = await this.llmAdapter.generateStructuredAnalysis<AnalysisResponseDto>(
      promptPayload.messages,
      ANALYSIS_OUTPUT_JSON_SCHEMA,
    );

    const executionTimeMs = Date.now() - startTime;
    const estimatedPayloadTokens = promptPayload.messages.length * 500; // estimated token count

    // Step C: Compliance Audit Trail Logging (Async)
    await this.saveAuditLog({
      documentId: dto.documentId,
      userQuery: dto.query,
      status: LogStatus.SUCCESS,
      responsePayload: JSON.stringify(structuredAnalysis),
      executionTimeMs,
      tokenCount: estimatedPayloadTokens,
    });

    this.logger.log(
      `[AiAgentService Success] Analisis statis berhasil untuk Dokumen ID '${dto.documentId}' dalam ${executionTimeMs}ms.`,
    );

    return {
      success: true,
      documentId: dto.documentId,
      data: structuredAnalysis,
      metadata: {
        executionTimeMs,
        estimatedPayloadTokens,
        llmProvider: this.llmAdapter.getProviderName(),
      },
    };
  }

  private createTimeoutGuard(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new RequestTimeoutException(
            `Proses analisis AI melebihi batas waktu aman (Circuit Breaker Timeout ${timeoutMs / 1000}s).`,
          ),
        );
      }, timeoutMs);
    });
  }

  private async saveAuditLog(logData: {
    documentId: string;
    userQuery: string;
    status: LogStatus;
    executionTimeMs: number;
    tokenCount?: number;
    responsePayload?: string;
    errorMessage?: string;
  }): Promise<void> {
    try {
      await this.prisma.aiAnalysisLog.create({
        data: {
          documentId: logData.documentId,
          userQuery: logData.userQuery,
          status: logData.status,
          executionTimeMs: logData.executionTimeMs,
          tokenCount: logData.tokenCount || 0,
          responsePayload: logData.responsePayload,
          errorMessage: logData.errorMessage,
        },
      });
      this.logger.log(`[Audit Logged] Rekam jejak AI berhasil dicatat di ai_analysis_logs.`);
    } catch (err: any) {
      this.logger.error(`[Audit Log Failed] Gagal mencatat log rekam jejak: ${err.message}`);
    }
  }
}
