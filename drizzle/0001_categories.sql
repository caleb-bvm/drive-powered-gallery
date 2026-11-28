CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"es" text NOT NULL,
	"en" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
