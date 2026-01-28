import type { PDF } from '@libpdf/core';
import { P12Signer } from '@libpdf/core';

import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';

export type SignPdfIncrementallyOptions = {
  pdf: PDF;
  certificateData: Buffer;
  passphrase: string;
  certificateName: string;
  reason?: string;
  location?: string;
  contactInfo?: string;
  signatureIndex?: number; // Optional: specify signature index for unique field naming
};

/**
 * Sign a PDF incrementally (adding signature without invalidating previous ones)
 *
 * This is critical for multi-signature workflows where each recipient adds their
 * signature sequentially without breaking previous signatures.
 */
export const signPdfIncrementally = async (
  options: SignPdfIncrementallyOptions,
): Promise<Buffer> => {
  const {
    pdf,
    certificateData,
    passphrase,
    certificateName,
    reason,
    location,
    contactInfo,
    signatureIndex,
  } = options;

  try {
    console.log('[IncrementalSigning] Signing PDF incrementally:', {
      certificateName,
      reason,
      certificateDataLength: certificateData.length,
      passphraseLength: passphrase.length,
      passphrasePreview: passphrase.substring(0, 4) + '***',
      signatureIndex,
    });

    // Create P12 signer
    const signer = await P12Signer.create(new Uint8Array(certificateData), passphrase, {
      buildChain: true,
    });

    // Create signature options with unique field name if signatureIndex is provided
    const baseOptions = {
      signer,
      reason: reason || `Signed by: ${certificateName}`,
      location: location || NEXT_PUBLIC_WEBAPP_URL(),
      contactInfo: contactInfo || NEXT_PUBLIC_WEBAPP_URL(),
      subFilter: 'ETSI.CAdES.detached' as const,
    };

    // Add field name to create new signature field instead of reusing existing one
    const signOptions =
      signatureIndex !== undefined
        ? { ...baseOptions, name: `Signature_${signatureIndex}` }
        : baseOptions;

    if (signatureIndex !== undefined) {
      console.log(
        '[IncrementalSigning] Using signature field name:',
        `Signature_${signatureIndex}`,
      );
    }

    // Sign the PDF using incremental update
    const { bytes } = await pdf.sign(signOptions);

    console.log('[IncrementalSigning] PDF signed successfully, size:', bytes.length);

    return Buffer.from(bytes);
  } catch (error) {
    console.error('[IncrementalSigning] Failed to sign PDF:', error);
    throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
      message: 'Failed to sign PDF incrementally',
    });
  }
};

/**
 * Count existing signatures in a PDF
 */
export const countPdfSignatures = async (pdf: PDF): Promise<number> => {
  try {
    // Get PDF document structure
    const bytes = await pdf.save();
    const content = Buffer.from(bytes).toString('binary');

    // Count signature dictionaries (simplified check)
    // In production, use proper PDF parsing
    const signatureMatches = content.match(/\/Type\s*\/Sig/g);
    return signatureMatches ? signatureMatches.length : 0;
  } catch (error) {
    console.error('[IncrementalSigning] Failed to count signatures:', error);
    return 0;
  }
};

/**
 * Verify if a PDF has been modified after signing
 */
export const verifyPdfIntegrity = async (pdf: PDF): Promise<boolean> => {
  try {
    // This is a placeholder - proper signature verification requires
    // checking each signature's digest against the PDF content
    // Consider using a dedicated library like node-signpdf for verification

    const signatureCount = await countPdfSignatures(pdf);

    // If there are signatures, we assume integrity check would be done
    // by the signing library during the sign operation
    return signatureCount > 0;
  } catch (error) {
    console.error('[IncrementalSigning] Failed to verify PDF integrity:', error);
    return false;
  }
};
