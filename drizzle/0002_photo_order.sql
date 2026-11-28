ALTER TABLE "albums" ADD COLUMN "custom_order" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "taken_at" timestamp with time zone;