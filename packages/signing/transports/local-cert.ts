import * as fs from 'node:fs';

import { getCertificateStatus } from '@documenso/lib/server-only/cert/cert-status';
import { getCertificateData } from '@documenso/lib/server-only/certificate/certificate';
import { env } from '@documenso/lib/utils/env';
import { signWithP12 } from '@documenso/pdf-sign';
import { prisma } from '@documenso/prisma';

import { addSigningPlaceholder } from '../helpers/add-signing-placeholder';
import { updateSigningPlaceholder } from '../helpers/update-signing-placeholder';

export type SignWithLocalCertOptions = {
  pdf: Buffer;
  certificateId?: string | null;
  teamId?: number;
};

export const signWithLocalCert = async ({
  pdf,
  certificateId,
  teamId,
}: SignWithLocalCertOptions) => {
  const { pdf: pdfWithPlaceholder, byteRange } = updateSigningPlaceholder({
    pdf: await addSigningPlaceholder({ pdf }),
  });

  const pdfWithoutSignature = Buffer.concat([
    new Uint8Array(pdfWithPlaceholder.subarray(0, byteRange[1])),
    new Uint8Array(pdfWithPlaceholder.subarray(byteRange[2])),
  ]);

  const signatureLength = byteRange[2] - byteRange[1];

  const certStatus = getCertificateStatus();

  if (!certStatus.isAvailable) {
    console.error('Certificate error: Certificate not available for document signing');
    throw new Error('Document signing failed: Certificate not available');
  }

  let cert: Buffer | null = null;
  let passphrase: string | undefined;

  // Try to load certificate from database if certificateId is provided
  if (certificateId && teamId) {
    try {
      console.log('[CERT DEBUG] Loading certificate from database:', {
        certificateId,
        teamId,
      });
      const certData = await getCertificateData({ certificateId, teamId });
      cert = certData.data;
      passphrase = certData.passphrase;
      console.log('[CERT DEBUG] Certificate loaded successfully:', {
        certSize: cert?.length,
        hasPassphrase: !!passphrase,
        passphraseLength: passphrase?.length,
        passphraseType: typeof passphrase,
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
    } catch {
      console.error('Certificate error: Failed to read certificate file');
      throw new Error('Document signing failed: Certificate file not accessible');
    }
  }

  console.log('[CERT DEBUG] About to call signWithP12:', {
    hasCert: !!cert,
    certSize: cert?.length,
    hasPassword: !!passphrase,
    passwordLength: passphrase?.length,
    passwordType: typeof passphrase,
    passwordIsEmpty: passphrase === '',
    passwordIsUndefined: passphrase === undefined,
    pdfSize: pdfWithoutSignature.length,
  });

  const signature = signWithP12({
    cert,
    content: pdfWithoutSignature,
    password: passphrase,
  });

  const signatureAsHex = signature.toString('hex');

  const signedPdf = Buffer.concat([
    new Uint8Array(pdfWithPlaceholder.subarray(0, byteRange[1])),
    new Uint8Array(Buffer.from(`<${signatureAsHex.padEnd(signatureLength - 2, '0')}>`)),
    new Uint8Array(pdfWithPlaceholder.subarray(byteRange[2])),
  ]);

  return signedPdf;
};
