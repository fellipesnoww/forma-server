-- CreateTable
CREATE TABLE "workout_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "sheet_id" UUID NOT NULL,
    "performed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "photo_url" TEXT,
    "comment" VARCHAR(1000),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_exercises" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "exercise_id" UUID,
    "custom_exercise_id" UUID,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "session_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_sets" (
    "id" UUID NOT NULL,
    "session_exercise_id" UUID NOT NULL,
    "set_number" INTEGER NOT NULL,
    "reps" INTEGER NOT NULL,
    "weight_kg" DOUBLE PRECISION NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "session_sets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workout_sessions_user_id_performed_at_idx" ON "workout_sessions"("user_id", "performed_at");

-- CreateIndex
CREATE INDEX "workout_sessions_sheet_id_idx" ON "workout_sessions"("sheet_id");

-- CreateIndex
CREATE INDEX "session_exercises_session_id_sort_order_idx" ON "session_exercises"("session_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "session_sets_session_exercise_id_set_number_key" ON "session_sets"("session_exercise_id", "set_number");

-- AddForeignKey
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_sheet_id_fkey" FOREIGN KEY ("sheet_id") REFERENCES "workout_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "workout_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_custom_exercise_id_fkey" FOREIGN KEY ("custom_exercise_id") REFERENCES "custom_exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_sets" ADD CONSTRAINT "session_sets_session_exercise_id_fkey" FOREIGN KEY ("session_exercise_id") REFERENCES "session_exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;
