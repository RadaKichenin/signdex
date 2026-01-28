import { z } from 'zod';

/**
 * OpenXPKI Certificate Request Status
 */
export enum OpenXPKICertificateStatus {
  PENDING = 'PENDING',
  ISSUED = 'ISSUED',
  REJECTED = 'REJECTED',
  REVOKED = 'REVOKED',
}

/**
 * Request certificate from OpenXPKI
 */
export type RequestCertificateOptions = {
  userId: number;
  email: string;
  commonName: string;
  organizationName?: string;
};

/**
 * Certificate request response from OpenXPKI
 */
export type CertificateRequestResponse = {
  requestId: string;
  serialNumber?: string;
  status: OpenXPKICertificateStatus;
  certificateData?: Buffer; // P12 format
  passphrase?: string;
  issuedAt?: Date;
  expiresAt?: Date;
};

/**
 * Revoke certificate options
 */
export type RevokeCertificateOptions = {
  serialNumber: string;
  reason?: 'keyCompromise' | 'affiliationChanged' | 'superseded' | 'cessationOfOperation';
};

/**
 * Certificate status check response
 */
export type CertificateStatusResponse = {
  serialNumber: string;
  status: OpenXPKICertificateStatus;
  issuedAt?: Date;
  expiresAt?: Date;
  revokedAt?: Date;
};

/**
 * OpenXPKI SCEP configuration
 */
export const ZOpenXPKIConfigSchema = z.object({
  scepUrl: z.string().url(),
  challengePassword: z.string(),
  profileName: z.string().default('user'),
  organizationName: z.string().default('Signdex'),
});

export type OpenXPKIConfig = z.infer<typeof ZOpenXPKIConfigSchema>;
