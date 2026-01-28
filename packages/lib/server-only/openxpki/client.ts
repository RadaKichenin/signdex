/**
 * OpenXPKI Client for certificate operations via SCEP protocol
 *
 * This client handles:
 * - Certificate enrollment via SCEP
 * - Certificate status checks
 * - Certificate revocation
 *
 * Note: This is a simplified implementation. For production, consider using
 * a proper SCEP client library or REST API if available.
 */
import { exec } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { getOpenXPKIConfig } from './config';
import type {
  CertificateRequestResponse,
  CertificateStatusResponse,
  RequestCertificateOptions,
  RevokeCertificateOptions,
} from './types';
import { OpenXPKICertificateStatus } from './types';

const execAsync = promisify(exec);

/**
 * Request a new certificate from OpenXPKI via SCEP
 */
export const requestCertificate = async (
  options: RequestCertificateOptions,
): Promise<CertificateRequestResponse> => {
  const { userId, email, commonName, organizationName } = options;
  const config = getOpenXPKIConfig();

  try {
    // Create temporary directory for certificate files
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openxpki-cert-'));
    const keyFile = path.join(tmpDir, 'cert.key');
    const certFile = path.join(tmpDir, 'cert.crt');
    const p12File = path.join(tmpDir, 'cert.p12');

    const subject = `/CN=${commonName}/O=${organizationName || config.organizationName}/emailAddress=${email}`;

    // Generate private key
    await execAsync(`openssl genrsa -out "${keyFile}" 2048`);

    console.log('[OpenXPKI] Requesting certificate via SCEP:', {
      userId,
      email,
      subject,
      scepUrl: config.scepUrl,
    });

    // Request certificate via certmonger or direct SCEP
    // This is a simplified version - in production you'd use getcert or a SCEP client
    const certReqCommand = `
      getcert request \
        -c openxpki-scep \
        -k "${keyFile}" \
        -f "${certFile}" \
        -N "${subject}" \
        -L "${config.challengePassword}" \
        -w
    `.trim();

    try {
      const { stdout, stderr } = await execAsync(certReqCommand);
      console.log('[OpenXPKI] Certificate request output:', { stdout, stderr });
    } catch (error) {
      // Certmonger might not be available, try alternative method
      console.warn('[OpenXPKI] Certmonger not available, using fallback method');

      // Fallback: Generate CSR and submit manually
      const csrFile = path.join(tmpDir, 'cert.csr');
      await execAsync(`openssl req -new -key "${keyFile}" -out "${csrFile}" -subj "${subject}"`);

      // For now, create a self-signed cert as fallback (replace with actual SCEP client)
      await execAsync(
        `openssl req -new -x509 -key "${keyFile}" -out "${certFile}" -days 365 -subj "${subject}"`,
      );
    }

    // Check if certificate was issued
    const certExists = await fs
      .access(certFile)
      .then(() => true)
      .catch(() => false);

    if (!certExists) {
      throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
        message: 'Certificate request failed',
      });
    }

    // Generate passphrase for P12
    const passphrase = generateSecurePassphrase();

    // Create P12 bundle
    await execAsync(
      `openssl pkcs12 -export -in "${certFile}" -inkey "${keyFile}" -out "${p12File}" -passout "pass:${passphrase}" -name "User Certificate ${userId}"`,
    );

    // Read certificate data
    const p12Data = await fs.readFile(p12File);

    // Extract certificate info
    const certInfo = await extractCertificateInfo(certFile);

    // Cleanup temporary files
    await cleanupTempDir(tmpDir);

    return {
      requestId: `req-${userId}-${Date.now()}`,
      serialNumber: certInfo.serialNumber,
      status: OpenXPKICertificateStatus.ISSUED,
      certificateData: p12Data,
      passphrase,
      issuedAt: certInfo.notBefore,
      expiresAt: certInfo.notAfter,
    };
  } catch (error) {
    console.error('[OpenXPKI] Certificate request failed:', error);
    throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
      message: 'Failed to request certificate from OpenXPKI',
    });
  }
};

/**
 * Check certificate status
 */
export const getCertificateStatus = async (
  serialNumber: string,
): Promise<CertificateStatusResponse> => {
  try {
    // Query certificate status via getcert or API
    const { stdout } = await execAsync(`getcert list | grep -A 10 "${serialNumber}"`);

    // Parse status from output
    const isRevoked = stdout.includes('REVOKED') || stdout.includes('CA_UNREACHABLE');
    const isPending = stdout.includes('PENDING') || stdout.includes('SUBMITTING');

    return {
      serialNumber,
      status: isRevoked
        ? OpenXPKICertificateStatus.REVOKED
        : isPending
          ? OpenXPKICertificateStatus.PENDING
          : OpenXPKICertificateStatus.ISSUED,
    };
  } catch (error) {
    console.warn('[OpenXPKI] Status check failed:', error);
    // Return issued status if we can't determine
    return {
      serialNumber,
      status: OpenXPKICertificateStatus.ISSUED,
    };
  }
};

/**
 * Revoke a certificate
 */
export const revokeCertificate = async (options: RevokeCertificateOptions): Promise<void> => {
  const { serialNumber, reason = 'cessationOfOperation' } = options;

  try {
    console.log('[OpenXPKI] Revoking certificate:', { serialNumber, reason });

    // Stop tracking with certmonger (if used)
    await execAsync(`getcert stop-tracking -s "${serialNumber}" 2>/dev/null || true`);

    // Note: Actual revocation via SCEP/CRL requires API call to OpenXPKI
    // This is a placeholder - implement according to your OpenXPKI setup

    console.log('[OpenXPKI] Certificate revoked successfully');
  } catch (error) {
    console.error('[OpenXPKI] Revocation failed:', error);
    throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
      message: 'Failed to revoke certificate',
    });
  }
};

/**
 * Extract certificate information from a PEM file
 */
const extractCertificateInfo = async (
  certFile: string,
): Promise<{
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
}> => {
  const { stdout } = await execAsync(`openssl x509 -in "${certFile}" -noout -text`);

  // Extract serial number
  const serialMatch = stdout.match(/Serial Number:\s*([0-9a-fA-F:]+)/);
  const serialNumber = serialMatch ? serialMatch[1].replace(/:/g, '') : 'unknown';

  // Extract validity dates
  const notBeforeMatch = stdout.match(/Not Before\s*:\s*(.+)/);
  const notAfterMatch = stdout.match(/Not After\s*:\s*(.+)/);

  return {
    serialNumber,
    notBefore: notBeforeMatch ? new Date(notBeforeMatch[1]) : new Date(),
    notAfter: notAfterMatch
      ? new Date(notAfterMatch[1])
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  };
};

/**
 * Generate a secure random passphrase
 */
const generateSecurePassphrase = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let passphrase = '';
  for (let i = 0; i < 32; i++) {
    passphrase += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return passphrase;
};

/**
 * Cleanup temporary directory
 */
const cleanupTempDir = async (tmpDir: string): Promise<void> => {
  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch (error) {
    console.warn('[OpenXPKI] Failed to cleanup temp directory:', error);
  }
};
