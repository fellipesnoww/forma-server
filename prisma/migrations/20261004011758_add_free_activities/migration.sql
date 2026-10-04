-- CreateTable
CREATE TABLE "activity_types" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "slug" VARCHAR(80),
    "name" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "free_activities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "activity_type_id" UUID NOT NULL,
    "performed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration_minutes" INTEGER NOT NULL,
    "comment" VARCHAR(1000),
    "photo_url" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "free_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "activity_types_slug_key" ON "activity_types"("slug");

-- CreateIndex
CREATE INDEX "activity_types_user_id_idx" ON "activity_types"("user_id");

-- CreateIndex
CREATE INDEX "free_activities_user_id_performed_at_idx" ON "free_activities"("user_id", "performed_at");

-- CreateIndex
CREATE INDEX "free_activities_activity_type_id_idx" ON "free_activities"("activity_type_id");

-- AddForeignKey
ALTER TABLE "activity_types" ADD CONSTRAINT "activity_types_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "free_activities" ADD CONSTRAINT "free_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "free_activities" ADD CONSTRAINT "free_activities_activity_type_id_fkey" FOREIGN KEY ("activity_type_id") REFERENCES "activity_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
