-- CreateTable
CREATE TABLE "raw_articles" (
    "id" UUID NOT NULL,
    "source_name" VARCHAR(255) NOT NULL,
    "source_type" VARCHAR(100) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "content" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ews_analyses" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "risk_level" VARCHAR(50) NOT NULL,
    "primary_category" VARCHAR(100) NOT NULL,
    "target_district" VARCHAR(255) NOT NULL,
    "summary" TEXT NOT NULL,
    "predicted_impact" TEXT NOT NULL,
    "recommended_actions" JSONB NOT NULL,
    "responsible_opd" VARCHAR(255) NOT NULL,
    "is_hoax_potential" BOOLEAN NOT NULL,
    "raw_ai_response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ews_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_baselines" (
    "id" UUID NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "baseline_value" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "action_type" VARCHAR(100) NOT NULL,
    "analysis_id" UUID,
    "notes" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "system_baselines_category_key" ON "system_baselines"("category");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "ews_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
