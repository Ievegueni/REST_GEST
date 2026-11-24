-- Login por nome de utilizador; email passa a opcional.
ALTER TABLE "User" ADD COLUMN "username" TEXT;
UPDATE "User" SET "username" = lower("email") WHERE "username" IS NULL;
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
