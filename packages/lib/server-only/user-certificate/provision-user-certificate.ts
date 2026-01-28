import { UserCertificateStatus } from '@prisma/client';

import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { prisma } from '@documenso/prisma';

import { encryptData, encryptString } from '../certificate/encryption';
import { requestCertificate } from '../openxpki';

export type ProvisionUserCertificateOptions = {
  userId: number;
  email: string;
  name: string;
  organizationName?: string;
};

/**
 * Provision a new certificate for a user from OpenXPKI
 */
export const provisionUserCertificate = async (options: ProvisionUserCertificateOptions) => {
  const { userId, email, name, organizationName } = options;

  try {
    // Check if user already has an active certificate
    const existingCert = await prisma.userCertificate.findFirst({
      where: {
        userId,
        status: UserCertificateStatus.ACTIVE,
        expiresAt: {
          gte: new Date(),
        },
      },
    });

    if (existingCert) {
      console.log('[UserCertificate] User already has active certificate:', {
        userId,
        certificateId: existingCert.id,
      });
      return existingCert;
    }

    console.log('[UserCertificate] Requesting new certificate from OpenXPKI:', {
      userId,
      email,
      name,
    });

    // Request certificate from OpenXPKI
    const certResponse = await requestCertificate({
      userId,
      email,
      commonName: name || email,
      organizationName,
    });

    if (!certResponse.certificateData || !certResponse.passphrase) {
      throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
        message: 'Certificate request failed - no certificate data received',
      });
    }

    // Encrypt certificate data and passphrase
    const encryptedData = encryptData(certResponse.certificateData);
    const encryptedPassphrase = encryptString(certResponse.passphrase);

    // Store in database
    const userCertificate = await prisma.userCertificate.create({
      data: {
        userId,
        certificateData: encryptedData,
        passphrase: encryptedPassphrase,
        serialNumber: certResponse.serialNumber || `cert-${Date.now()}`,
        commonName: name || email,
        issuedAt: certResponse.issuedAt || new Date(),
        expiresAt: certResponse.expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: UserCertificateStatus.ACTIVE,
      },
    });

    console.log('[UserCertificate] Certificate provisioned successfully:', {
      userId,
      certificateId: userCertificate.id,
      serialNumber: userCertificate.serialNumber,
    });

    return userCertificate;
  } catch (error) {
    console.error('[UserCertificate] Failed to provision certificate:', error);
    throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
      message: 'Failed to provision user certificate',
    });
  }
};
