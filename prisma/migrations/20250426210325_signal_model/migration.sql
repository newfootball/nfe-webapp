-- CreateEnum
CREATE TYPE "SignalReason" AS ENUM ('INAPPROPRIATE', 'SPAM', 'OFFENSIVE', 'MISLEADING', 'OTHER');

-- CreateTable
CREATE TABLE "PostSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "reason" "SignalReason" NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostSignal_postId_userId_key" ON "PostSignal"("postId", "userId");

-- AddForeignKey
ALTER TABLE "PostSignal" ADD CONSTRAINT "PostSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostSignal" ADD CONSTRAINT "PostSignal_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
