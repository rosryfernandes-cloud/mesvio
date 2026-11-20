ALTER TABLE "clock_employees" ADD COLUMN "face_ciphertext" text;--> statement-breakpoint
ALTER TABLE "clock_employees" ADD COLUMN "face_enrolled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "establishments" ADD COLUMN "clock_face_enabled" boolean DEFAULT false NOT NULL;