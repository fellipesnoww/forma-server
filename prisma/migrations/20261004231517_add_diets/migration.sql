-- CreateEnum
CREATE TYPE "food_unit" AS ENUM ('g', 'kg', 'ml', 'l');

-- CreateTable
CREATE TABLE "diets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "goal" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "diets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diet_meals" (
    "id" UUID NOT NULL,
    "diet_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "time" VARCHAR(5) NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "diet_meals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diet_foods" (
    "id" UUID NOT NULL,
    "meal_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" "food_unit" NOT NULL,
    "kcal" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "diet_foods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "diets_user_id_is_active_idx" ON "diets"("user_id", "is_active");

-- CreateIndex
CREATE INDEX "diet_meals_diet_id_time_sort_order_idx" ON "diet_meals"("diet_id", "time", "sort_order");

-- CreateIndex
CREATE INDEX "diet_foods_meal_id_sort_order_idx" ON "diet_foods"("meal_id", "sort_order");

-- AddForeignKey
ALTER TABLE "diets" ADD CONSTRAINT "diets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_meals" ADD CONSTRAINT "diet_meals_diet_id_fkey" FOREIGN KEY ("diet_id") REFERENCES "diets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_foods" ADD CONSTRAINT "diet_foods_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "diet_meals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
