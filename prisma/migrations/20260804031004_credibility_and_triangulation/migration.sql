-- AlterTable
ALTER TABLE "raw_articles" ADD COLUMN     "credibility_factors" JSONB,
ADD COLUMN     "credibility_score" DOUBLE PRECISION,
ADD COLUMN     "triangulation_group" VARCHAR(100);
