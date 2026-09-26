-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN     "chest_cm" DOUBLE PRECISION,
ADD COLUMN     "height_cm" DOUBLE PRECISION,
ADD COLUMN     "waist_cm" DOUBLE PRECISION,
ADD COLUMN     "weight_kg" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "body_measurements" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "weight_kg" DOUBLE PRECISION,
    "height_cm" DOUBLE PRECISION,
    "waist_cm" DOUBLE PRECISION,
    "chest_cm" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "body_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "body_measurements_user_id_created_at_idx" ON "body_measurements"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "body_measurements" ADD CONSTRAINT "body_measurements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
