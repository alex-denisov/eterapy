-- CreateTable
CREATE TABLE "schedule_rules" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startHour" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL DEFAULT 0,
    "endHour" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "schedule_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_slots" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blocked_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_rates" (
    "id" TEXT NOT NULL,
    "practitionerId" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "priceRub" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "price_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedule_rules_practitionerId_idx" ON "schedule_rules"("practitionerId");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_rules_practitionerId_dayOfWeek_key" ON "schedule_rules"("practitionerId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "blocked_slots_practitionerId_startAt_idx" ON "blocked_slots"("practitionerId", "startAt");

-- CreateIndex
CREATE INDEX "price_rates_practitionerId_idx" ON "price_rates"("practitionerId");

-- CreateIndex
CREATE UNIQUE INDEX "price_rates_practitionerId_durationMin_key" ON "price_rates"("practitionerId", "durationMin");

-- AddForeignKey
ALTER TABLE "schedule_rules" ADD CONSTRAINT "schedule_rules_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "practitioners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_slots" ADD CONSTRAINT "blocked_slots_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "practitioners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rates" ADD CONSTRAINT "price_rates_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "practitioners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
