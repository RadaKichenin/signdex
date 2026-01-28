import { prisma } from '@documenso/prisma';

export type RecordDigitalSignatureOptions = {
  envelopeId: string;
  recipientId?: number;
  fieldId?: number;
  userCertificateId?: string;
  teamCertificateId?: string;
  signatureData?: {
    location?: string;
    reason?: string;
    contactInfo?: string;
  };
  signatureIndex: number;
};

/**
 * Record a digital signature applied to a PDF document
 */
export const recordDigitalSignature = async (options: RecordDigitalSignatureOptions) => {
  const {
    envelopeId,
    recipientId,
    fieldId,
    userCertificateId,
    teamCertificateId,
    signatureData,
    signatureIndex,
  } = options;

  const digitalSignature = await prisma.digitalSignature.create({
    data: {
      envelopeId,
      recipientId,
      fieldId,
      userCertificateId,
      teamCertificateId,
      signatureData: signatureData || {},
      signatureIndex,
    },
    include: {
      recipient: {
        select: {
          email: true,
          name: true,
        },
      },
      userCertificate: {
        select: {
          serialNumber: true,
          commonName: true,
        },
      },
      teamCertificate: {
        select: {
          name: true,
        },
      },
    },
  });

  console.log('[DigitalSignature] Recorded digital signature:', {
    id: digitalSignature.id,
    envelopeId,
    recipientId,
    signatureIndex,
  });

  return digitalSignature;
};

/**
 * Get all digital signatures for an envelope
 */
export const getEnvelopeDigitalSignatures = async (envelopeId: string) => {
  return await prisma.digitalSignature.findMany({
    where: {
      envelopeId,
    },
    orderBy: {
      signatureIndex: 'asc',
    },
    include: {
      recipient: {
        select: {
          email: true,
          name: true,
          role: true,
        },
      },
      field: {
        select: {
          type: true,
          secondaryId: true,
        },
      },
      userCertificate: {
        select: {
          serialNumber: true,
          commonName: true,
          issuedAt: true,
          expiresAt: true,
        },
      },
      teamCertificate: {
        select: {
          name: true,
        },
      },
    },
  });
};

/**
 * Get next signature index for an envelope
 */
export const getNextSignatureIndex = async (envelopeId: string): Promise<number> => {
  const lastSignature = await prisma.digitalSignature.findFirst({
    where: {
      envelopeId,
    },
    orderBy: {
      signatureIndex: 'desc',
    },
    select: {
      signatureIndex: true,
    },
  });

  return (lastSignature?.signatureIndex ?? 0) + 1;
};

/**
 * Check if a recipient has already digitally signed
 */
export const hasRecipientDigitallySigned = async (
  envelopeId: string,
  recipientId: number,
): Promise<boolean> => {
  const signature = await prisma.digitalSignature.findFirst({
    where: {
      envelopeId,
      recipientId,
    },
  });

  return !!signature;
};
