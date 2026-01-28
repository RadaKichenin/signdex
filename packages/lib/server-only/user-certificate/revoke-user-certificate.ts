import { UserCertificateStatus } from '@prisma/client';

import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { prisma } from '@documenso/prisma';

import { revokeCertificate as revokeOpenXPKICertificate } from '../openxpki';

export type RevokeUserCertificateOptions = {
  certificateId: string;
  userId: number;
  reason?: 'keyCompromise' | 'affiliationChanged' | 'superseded' | 'cessationOfOperation';
};

/**
 * Revoke a user certificate
 */
export const revokeUserCertificate = async (options: RevokeUserCertificateOptions) => {
  const { certificateId, userId, reason } = options;

  try {
    // Verify certificate belongs to user
    const certificate = await prisma.userCertificate.findFirst({
      where: {
        id: certificateId,
        userId,
      },
    });

    if (!certificate) {
      throw new AppError(AppErrorCode.NOT_FOUND, {
        message: 'Certificate not found',
      });
    }

    if (certificate.status === UserCertificateStatus.REVOKED) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: 'Certificate already revoked',
      });
    }

    // Revoke in OpenXPKI
    await revokeOpenXPKICertificate({
      serialNumber: certificate.serialNumber,
      reason,
    });

    // Update database
    const updatedCertificate = await prisma.userCertificate.update({
      where: {
        id: certificateId,
      },
      data: {
        status: UserCertificateStatus.REVOKED,
        revokedAt: new Date(),
      },
    });

    console.log('[UserCertificate] Certificate revoked:', {
      certificateId,
      userId,
      serialNumber: certificate.serialNumber,
    });

    return updatedCertificate;
  } catch (error) {
    console.error('[UserCertificate] Failed to revoke certificate:', error);
    throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
      message: 'Failed to revoke certificate',
    });
  }
};
