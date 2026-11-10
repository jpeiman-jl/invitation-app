ALTER TABLE "events"
ADD COLUMN "program_items" JSONB NOT NULL DEFAULT '[]';
