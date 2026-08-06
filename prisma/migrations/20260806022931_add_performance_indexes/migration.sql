-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "ews_issues_created_at_idx" ON "ews_issues"("created_at");

-- CreateIndex
CREATE INDEX "ews_issues_status_idx" ON "ews_issues"("status");

-- CreateIndex
CREATE INDEX "ews_issues_risk_level_idx" ON "ews_issues"("risk_level");
