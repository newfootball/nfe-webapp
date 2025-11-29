-- DropIndex
DROP INDEX IF EXISTS "Account_provider_providerAccountId_key";

-- DropIndex
DROP INDEX IF EXISTS "Session_sessionToken_key";

-- DropTable
DROP TABLE IF EXISTS "VerificationToken";

-- AlterTable Account - Drop old columns
ALTER TABLE "Account" DROP COLUMN IF EXISTS "type";
ALTER TABLE "Account" DROP COLUMN IF EXISTS "provider";
ALTER TABLE "Account" DROP COLUMN IF EXISTS "providerAccountId";
ALTER TABLE "Account" DROP COLUMN IF EXISTS "refresh_token";
ALTER TABLE "Account" DROP COLUMN IF EXISTS "access_token";
ALTER TABLE "Account" DROP COLUMN IF EXISTS "expires_at";
ALTER TABLE "Account" DROP COLUMN IF EXISTS "token_type";
ALTER TABLE "Account" DROP COLUMN IF EXISTS "id_token";
ALTER TABLE "Account" DROP COLUMN IF EXISTS "session_state";

-- AlterTable Account - Add new columns
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "accountId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "providerId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "accessToken" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "refreshToken" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "accessTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "refreshTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "idToken" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "password" TEXT;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable Session - Drop old columns
ALTER TABLE "Session" DROP COLUMN IF EXISTS "sessionToken";
ALTER TABLE "Session" DROP COLUMN IF EXISTS "expires";

-- AlterTable Session - Add new columns
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "token" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable User - Change emailVerified type
ALTER TABLE "User" DROP COLUMN IF EXISTS "emailVerified";
ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable Verification
CREATE TABLE IF NOT EXISTS "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex Account
CREATE UNIQUE INDEX IF NOT EXISTS "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");

-- CreateIndex Session
CREATE UNIQUE INDEX IF NOT EXISTS "Session_token_key" ON "Session"("token");

-- CreateIndex Session userId
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");

-- CreateIndex Verification
CREATE INDEX IF NOT EXISTS "Verification_identifier_idx" ON "Verification"("identifier");
