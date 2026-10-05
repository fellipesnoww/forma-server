-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "storage_key" VARCHAR(512),
ALTER COLUMN "data" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storage_key_key" ON "media_assets"("storage_key");
