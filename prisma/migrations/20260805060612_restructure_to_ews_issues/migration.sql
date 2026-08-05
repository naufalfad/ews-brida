/*
  Warnings:

  - You are about to drop the column `analysis_id` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the `ews_analyses` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `raw_articles` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_analysis_id_fkey";

-- AlterTable
ALTER TABLE "audit_logs" DROP COLUMN "analysis_id",
ADD COLUMN     "issue_id" UUID;

-- DropTable
DROP TABLE "ews_analyses";

-- DropTable
DROP TABLE "raw_articles";

-- CreateTable
CREATE TABLE "ews_issues" (
    "id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT NOT NULL,
    "source_name" VARCHAR(255) NOT NULL,
    "source_url" TEXT NOT NULL,
    "sources" JSONB NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "is_hoax" BOOLEAN,
    "verification_score" DOUBLE PRECISION,
    "verification_notes" TEXT,
    "risk_level" VARCHAR(50),
    "primary_category" VARCHAR(100),
    "target_district" VARCHAR(255),
    "analysis_summary" TEXT,
    "predicted_impact" TEXT,
    "mitigation_actions" JSONB,
    "responsible_opd" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ews_issues_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "ews_issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
