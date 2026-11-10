ALTER TABLE "events"
ADD COLUMN "occasion_types" JSONB NOT NULL DEFAULT '["wedding"]';
