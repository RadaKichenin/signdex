import { UserCertificateStatus } from '@prisma/client';

import { prisma } from '@documenso/prisma';

import { decryptData, decryptString } from '../certificate/encryption';

export type GetUserCertificateOptions = {
  userId: number;
  includeData?: boolean;
};

/**
 * Get active user certificate
 */
export const getActiveUserCertificate = async ({
  userId,
  includeData = false,
}: GetUserCertificateOptions) => {
  const certificate = await prisma.userCertificate.findFirst({
    where: {
      userId,
      status: UserCertificateStatus.ACTIVE,
      expiresAt: {
        gte: new Date(),
      },
    },
    orderBy: {
      issuedAt: 'desc',
    },
  });

  if (!certificate) {
    return null;
  }

  if (includeData) {
    const certDataBuffer = Buffer.from(certificate.certificateData);

    return {
      ...certificate,
      certificateData: decryptData(certDataBuffer),
      passphrase: decryptString(certificate.passphrase),
    };
  }

  return certificate;
};

/**
 * Get all user certificates
 */
export const getUserCertificates = async (userId: number) => {
  return await prisma.userCertificate.findMany({
    where: {
      userId,
    },
    orderBy: {
      issuedAt: 'desc',
    },
    select: {
      id: true,
      serialNumber: true,
      commonName: true,
      issuedAt: true,
      expiresAt: true,
      revokedAt: true,
      status: true,
      createdAt: true,
    },
  });
};

/**
 * Get user certificate by serial number
 */
export const getUserCertificateBySerial = async (serialNumber: string) => {
  return await prisma.userCertificate.findFirst({
    where: {
      serialNumber,
    },
  });
};

/**
 * Update certificate status
 */
export const updateCertificateStatus = async (
  certificateId: string,
  status: UserCertificateStatus,
  revokedAt?: Date,
) => {
  return await prisma.userCertificate.update({
    where: {
      id: certificateId,
    },
    data: {
      status,
      revokedAt,
    },
  });
};
