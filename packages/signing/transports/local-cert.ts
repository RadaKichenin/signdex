import type { PDF } from '@libpdf/core';
import { P12Signer } from '@libpdf/core';
import * as fs from 'node:fs';

import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import { getCertificateStatus } from '@documenso/lib/server-only/cert/cert-status';
import { getCertificateData } from '@documenso/lib/server-only/certificate/certificate';
import { env } from '@documenso/lib/utils/env';
import { prisma } from '@documenso/prisma';

export type SignWithLocalCertOptions = {
  pdf: PDF;
  certificateId?: string | null;
  teamId?: number;
};

export const signWithLocalCert = async ({
  pdf,
  certificateId,
  teamId,
}: SignWithLocalCertOptions) => {
  const certStatus = getCertificateStatus();

  if (!certStatus.isAvailable) {
    console.error('Certificate error: Certificate not available for document signing');
    throw new Error('Document signing failed: Certificate not available');
  }

  let cert: Buffer | null = null;
  let passphrase: string | undefined;
  let certificateName: string | undefined;

  // Try to load certificate from database if certificateId is provided
  if (certificateId && teamId) {
    try {
      console.log('[CERT DEBUG] Loading certificate from database:', {
        certificateId,
        teamId,
      });
      const certificate = await prisma.certificate.findFirst({
        where: {
          id: certificateId,
          teamId,
        },
      });

      if (certificate) {
        certificateName = certificate.name;
        const certData = await getCertificateData({ certificateId, teamId });
        cert = certData.data;
        passphrase = certData.passphrase;
      }
      console.log('[CERT DEBUG] Certificate loaded successfully:', {
        certSize: cert?.length,
        hasPassphrase: !!passphrase,
        passphraseLength: passphrase?.length,
        passphraseType: typeof passphrase,
        certificateName,
      });
    } catch (error) {
      console.error('Certificate error: Failed to load certificate from database', error);
      // Fall through to try other methods
    }
  }

  // If no certificate from database, try to load default certificate for the team
  if (!cert && teamId) {
    try {
      const defaultCert = await prisma.certificate.findFirst({
        where: {
          teamId,
          isDefault: true,
        },
      });

      if (defaultCert) {
        certificateName = defaultCert.name;
        const certData = await getCertificateData({
          certificateId: defaultCert.id,
          teamId,
        });
        cert = certData.data;
        passphrase = certData.passphrase;
      }
    } catch (error) {
      console.error('Certificate error: Failed to load default certificate', error);
      // Fall through to try environment variables
    }
  }

  // Fall back to environment variable certificate
  if (!cert) {
    const localFileContents = env('NEXT_PRIVATE_SIGNING_LOCAL_FILE_CONTENTS');

    if (localFileContents) {
      try {
        cert = Buffer.from(localFileContents, 'base64');
        passphrase = env('NEXT_PRIVATE_SIGNING_PASSPHRASE') || undefined;
        certificateName = 'Environment Certificate';
      } catch {
        throw new Error('Failed to decode certificate contents');
      }
    }
  }

  if (!cert) {
    let certPath = env('NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH') || '/opt/documenso/cert.p12';

    // We don't want to make the development server suddenly crash when using the `dx` script
    // so we retain this when NODE_ENV isn't set to production which it should be in most production
    // deployments.
    //
    // Our docker image automatically sets this so it shouldn't be an issue for self-hosters.
    if (env('NODE_ENV') !== 'production') {
      certPath = env('NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH') || './example/cert.p12';
    }

    try {
      cert = Buffer.from(fs.readFileSync(certPath));
      passphrase = env('NEXT_PRIVATE_SIGNING_PASSPHRASE') || undefined;
      certificateName = 'Local File Certificate';
    } catch {
      console.error('Certificate error: Failed to read certificate file');
      throw new Error('Document signing failed: Certificate file not accessible');
    }
  }

  console.log('[CERT DEBUG] About to sign with P12Signer:', {
    hasCert: !!cert,
    certSize: cert?.length,
    hasPassword: !!passphrase,
    passwordLength: passphrase?.length,
    passwordType: typeof passphrase,
    certificateName,
    certPreview: cert?.toString('hex').substring(0, 40),
  });

  try {
    // Create P12 signer with modern encryption support
    const signer = await P12Signer.create(new Uint8Array(cert), passphrase || '', {
      buildChain: true,
    });

    console.log('[CERT DEBUG] P12Signer created successfully');

    // Sign the PDF using the new API
    const { bytes } = await pdf.sign({
      signer,
      reason: certificateName ? `Signed with: ${certificateName}` : 'Signed by Documenso',
      location: NEXT_PUBLIC_WEBAPP_URL(),
      contactInfo: NEXT_PUBLIC_WEBAPP_URL(),
      subFilter: 'ETSI.CAdES.detached',
    });

    console.log('[CERT DEBUG] PDF signed successfully, size:', bytes.length);

    return Buffer.from(bytes);
  } catch (error) {
    console.error('[CERT DEBUG] Signing failed with detailed error:', {
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      errorName: error instanceof Error ? error.name : undefined,
      certSize: cert?.length,
      passphraseLength: passphrase?.length,
    });
    throw error;
  }
};
