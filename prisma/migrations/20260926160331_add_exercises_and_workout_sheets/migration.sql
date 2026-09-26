-- CreateTable
CREATE TABLE "muscle_groups" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,

    CONSTRAINT "muscle_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercises" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "muscle_group_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "media_url" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_exercises" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "muscle_group_id" UUID,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "custom_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_sheets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workout_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_days" (
    "id" UUID NOT NULL,
    "sheet_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sheet_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_exercises" (
    "id" UUID NOT NULL,
    "day_id" UUID NOT NULL,
    "exercise_id" UUID,
    "custom_exercise_id" UUID,
    "sort_order" INTEGER NOT NULL,
    "target_sets" INTEGER,
    "target_reps" INTEGER,

    CONSTRAINT "sheet_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "muscle_groups_slug_key" ON "muscle_groups"("slug");

-- CreateIndex
CREATE INDEX "exercises_muscle_group_id_idx" ON "exercises"("muscle_group_id");

-- CreateIndex
CREATE INDEX "custom_exercises_user_id_deleted_at_idx" ON "custom_exercises"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "workout_sheets_user_id_deleted_at_idx" ON "workout_sheets"("user_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_days_sheet_id_weekday_key" ON "sheet_days"("sheet_id", "weekday");

-- CreateIndex
CREATE INDEX "sheet_exercises_day_id_sort_order_idx" ON "sheet_exercises"("day_id", "sort_order");

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_muscle_group_id_fkey" FOREIGN KEY ("muscle_group_id") REFERENCES "muscle_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_exercises" ADD CONSTRAINT "custom_exercises_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_exercises" ADD CONSTRAINT "custom_exercises_muscle_group_id_fkey" FOREIGN KEY ("muscle_group_id") REFERENCES "muscle_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sheets" ADD CONSTRAINT "workout_sheets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_days" ADD CONSTRAINT "sheet_days_sheet_id_fkey" FOREIGN KEY ("sheet_id") REFERENCES "workout_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_exercises" ADD CONSTRAINT "sheet_exercises_day_id_fkey" FOREIGN KEY ("day_id") REFERENCES "sheet_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_exercises" ADD CONSTRAINT "sheet_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_exercises" ADD CONSTRAINT "sheet_exercises_custom_exercise_id_fkey" FOREIGN KEY ("custom_exercise_id") REFERENCES "custom_exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE;
