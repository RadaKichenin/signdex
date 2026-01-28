-- CreateEnum
CREATE TYPE "UserCertificateStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'PENDING');

-- CreateTable
CREATE TABLE "UserCertificate" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "certificateData" BYTEA NOT NULL,
    "passphrase" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "commonName" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "status" "UserCertificateStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigitalSignature" (
    "id" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "recipientId" INTEGER,
    "fieldId" INTEGER,
    "userCertificateId" TEXT,
    "teamCertificateId" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signatureData" JSONB,
    "signatureIndex" INTEGER NOT NULL,

    CONSTRAINT "DigitalSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserCertificate_userId_idx" ON "UserCertificate"("userId");

-- CreateIndex
CREATE INDEX "UserCertificate_serialNumber_idx" ON "UserCertificate"("serialNumber");

-- CreateIndex
CREATE INDEX "UserCertificate_status_idx" ON "UserCertificate"("status");

-- CreateIndex
CREATE INDEX "UserCertificate_expiresAt_idx" ON "UserCertificate"("expiresAt");

-- CreateIndex
CREATE INDEX "DigitalSignature_envelopeId_idx" ON "DigitalSignature"("envelopeId");

-- CreateIndex
CREATE INDEX "DigitalSignature_recipientId_idx" ON "DigitalSignature"("recipientId");

-- CreateIndex
CREATE INDEX "DigitalSignature_fieldId_idx" ON "DigitalSignature"("fieldId");

-- CreateIndex
CREATE INDEX "DigitalSignature_signedAt_idx" ON "DigitalSignature"("signedAt");

-- AddForeignKey
ALTER TABLE "UserCertificate" ADD CONSTRAINT "UserCertificate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalSignature" ADD CONSTRAINT "DigitalSignature_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalSignature" ADD CONSTRAINT "DigitalSignature_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalSignature" ADD CONSTRAINT "DigitalSignature_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalSignature" ADD CONSTRAINT "DigitalSignature_userCertificateId_fkey" FOREIGN KEY ("userCertificateId") REFERENCES "UserCertificate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalSignature" ADD CONSTRAINT "DigitalSignature_teamCertificateId_fkey" FOREIGN KEY ("teamCertificateId") REFERENCES "Certificate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
