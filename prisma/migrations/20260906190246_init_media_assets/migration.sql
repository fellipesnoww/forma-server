-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "owner_id" UUID,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "filename" VARCHAR(255),
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_assets_owner_id_created_at_idx" ON "media_assets"("owner_id", "created_at");
