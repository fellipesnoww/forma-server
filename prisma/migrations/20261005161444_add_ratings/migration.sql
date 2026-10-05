-- CreateEnum
CREATE TYPE "rating_platform" AS ENUM ('mobile', 'web');

-- CreateTable
CREATE TABLE "ratings" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rank" SMALLINT NOT NULL,
    "observation" VARCHAR(2000),
    "platform" "rating_platform" NOT NULL,
    "device" VARCHAR(120) NOT NULL,
    "date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ratings_date_idx" ON "ratings"("date");

-- CreateIndex
CREATE INDEX "ratings_user_id_date_idx" ON "ratings"("user_id", "date");

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma nao modela CHECK: a faixa da nota e garantida aqui tambem, nao so pelo Zod da API
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_rank_check" CHECK ("rank" BETWEEN 1 AND 5);
