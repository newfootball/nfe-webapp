/*
  Warnings:

  - The `status` column on the `PostSignal` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "SignalStatus" AS ENUM ('PENDING', 'REVIEWED', 'DISMISSED');

-- AlterTable
ALTER TABLE "PostSignal" DROP COLUMN "status",
ADD COLUMN     "status" "SignalStatus" NOT NULL DEFAULT 'PENDING';
