CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photos_project_idx" ON "photos" USING btree ("project_id");--> statement-breakpoint
-- The renderer reads photo locations to embed them in exports (least privilege, plan §8.1).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mapmory_renderer') THEN
    GRANT SELECT (id, project_id, object_key, width, height) ON photos TO mapmory_renderer;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mapmory_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON photos TO mapmory_app;
  END IF;
END $$;
