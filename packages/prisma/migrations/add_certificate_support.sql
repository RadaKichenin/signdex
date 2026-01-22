-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "passphrase" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "teamId" INTEGER NOT NULL,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "DocumentMeta" ADD COLUMN "certificateId" TEXT;

-- CreateIndex
CREATE INDEX "Certificate_teamId_idx" ON "Certificate"("teamId");

-- CreateIndex
CREATE INDEX "Certificate_isDefault_idx" ON "Certificate"("isDefault");

-- CreateIndex
CREATE INDEX "DocumentMeta_certificateId_idx" ON "DocumentMeta"("certificateId");

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentMeta" ADD CONSTRAINT "DocumentMeta_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
