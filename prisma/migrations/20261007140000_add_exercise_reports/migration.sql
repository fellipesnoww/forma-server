-- CreateTable
CREATE TABLE "exercise_reports" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "text" VARCHAR(2000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercise_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exercise_reports_created_at_idx" ON "exercise_reports"("created_at");

-- CreateIndex
CREATE INDEX "exercise_reports_exercise_id_created_at_idx" ON "exercise_reports"("exercise_id", "created_at");

-- AddForeignKey
ALTER TABLE "exercise_reports" ADD CONSTRAINT "exercise_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_reports" ADD CONSTRAINT "exercise_reports_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

