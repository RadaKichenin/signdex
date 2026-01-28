import type { PDF } from '@libpdf/core';

import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { getActiveUserCertificate } from '@documenso/lib/server-only/user-certificate';
import { prisma } from '@documenso/prisma';

import { signPdfIncrementally } from '../strategies/incremental-signing';

export type SignPdfWithUserCertificateOptions = {
  pdf: PDF;
  userId: number;
  recipientName: string;
  reason?: string;
};

/**
 * Sign a PDF using the user's digital certificate from OpenXPKI
 */
export const signPdfWithUserCertificate = async (
  options: SignPdfWithUserCertificateOptions,
): Promise<Buffer> => {
  const { pdf, userId, recipientName, reason } = options;

  try {
    // Get user's active certificate
    const certificate = await getActiveUserCertificate({
      userId,
      includeData: true,
    });

    if (!certificate) {
      throw new AppError(AppErrorCode.NOT_FOUND, {
        message: 'User does not have an active certificate',
      });
    }

    // Validate certificate data
    if (!certificate.certificateData || !certificate.passphrase) {
      throw new AppError(AppErrorCode.INVALID_BODY, {
        message: 'Certificate data or passphrase is missing',
      });
    }

    // Get user details
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (!user) {
      throw new AppError(AppErrorCode.NOT_FOUND, {
        message: 'User not found',
      });
    }

    console.log('[UserCertificateSigning] Signing with user certificate:', {
      userId,
      certificateId: certificate.id,
      serialNumber: certificate.serialNumber,
    });

    // Sign the PDF
    const signedPdfBuffer = await signPdfIncrementally({
      pdf,
      certificateData: Buffer.from(certificate.certificateData),
      passphrase: certificate.passphrase,
      certificateName: recipientName || user.name || user.email,
      reason: reason || `Signed by ${recipientName || user.name || user.email}`,
      location: `User ID: ${userId}`,
      contactInfo: user.email,
    });

    return Buffer.isBuffer(signedPdfBuffer) ? signedPdfBuffer : Buffer.from(signedPdfBuffer);
  } catch (error) {
    console.error('[UserCertificateSigning] Failed to sign PDF:', error);
    throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
      message: 'Failed to sign PDF with user certificate',
    });
  }
};
