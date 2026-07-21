ALTER TABLE "tiles" ADD COLUMN "chunk_x" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tiles" ADD COLUMN "chunk_y" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "tiles"
SET
	"chunk_x" = floor("pos_x" / 8.0)::integer,
	"chunk_y" = floor("pos_y" / 8.0)::integer;--> statement-breakpoint
CREATE INDEX "tiles_canvas_chunk_created_idx" ON "tiles" USING btree ("canvas_id", "chunk_x", "chunk_y", "created_at");
