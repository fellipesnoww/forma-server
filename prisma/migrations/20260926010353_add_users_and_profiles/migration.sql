-- CreateEnum
CREATE TYPE "role" AS ENUM ('user', 'admin', 'super_user');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'inactive', 'banned');

-- CreateEnum
CREATE TYPE "oauth_provider" AS ENUM ('google', 'apple');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT,
    "oauth_provider" "oauth_provider",
    "oauth_subject" VARCHAR(255),
    "role" "role" NOT NULL DEFAULT 'user',
    "status" "user_status" NOT NULL DEFAULT 'active',
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "user_id" UUID NOT NULL,
    "display_name" VARCHAR(120),
    "avatar_url" TEXT,
    "onboarding_completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_oauth_provider_oauth_subject_key" ON "users"("oauth_provider", "oauth_subject");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
