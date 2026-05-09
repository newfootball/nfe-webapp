-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LIKE', 'COMMENT', 'FOLLOW', 'MESSAGE');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "type" "NotificationType" NOT NULL DEFAULT 'COMMENT';
