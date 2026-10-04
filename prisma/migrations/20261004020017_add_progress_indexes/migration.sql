-- CreateIndex
CREATE INDEX "session_exercises_exercise_id_session_id_idx" ON "session_exercises"("exercise_id", "session_id");

-- CreateIndex
CREATE INDEX "session_exercises_custom_exercise_id_session_id_idx" ON "session_exercises"("custom_exercise_id", "session_id");
