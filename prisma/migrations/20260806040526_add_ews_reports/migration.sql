-- CreateTable
CREATE TABLE "ews_reports" (
    "id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "content" TEXT NOT NULL,
    "author" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ews_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ews_reports_created_at_idx" ON "ews_reports"("created_at");

-- AddForeignKey
ALTER TABLE "ews_reports" ADD CONSTRAINT "ews_reports_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "ews_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
