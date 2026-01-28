import { PDF } from '@libpdf/core';

import { getFileServerSide } from '@documenso/lib/universal/upload/get-file.server';
import { putPdfFileServerSide } from '@documenso/lib/universal/upload/put-file.server';
import { prisma } from '@documenso/prisma';
import { signPdfWithUserCertificate } from '@documenso/signing/transports/user-cert';

import { AppError, AppErrorCode } from '../../../errors/app-error';
import {
  getNextSignatureIndex,
  recordDigitalSignature,
} from '../../../server-only/digital-signature';
import { isOpenXPKIEnabled } from '../../../server-only/openxpki';
import { getActiveUserCertificate } from '../../../server-only/user-certificate';
import type { JobDefinition, JobRunIO } from '../../client/_internal/job';

export const SIGN_WITH_USER_CERTIFICATE_JOB_DEFINITION_ID =
  'internal.sign-with-user-certificate' as const;
export const SIGN_WITH_USER_CERTIFICATE_JOB_DEFINITION_VERSION = '1.0.0' as const;

export type TSignWithUserCertificateJobDefinition = JobDefinition<
  typeof SIGN_WITH_USER_CERTIFICATE_JOB_DEFINITION_ID,
  {
    envelopeId: string;
    recipientId: number;
    userId: number;
    fieldId?: number;
  }
>;

/**
 * Job to apply digital signature to a document after a recipient completes signing
 *
 * This runs after field signing is complete but before the final seal-document
 */
export const SIGN_WITH_USER_CERTIFICATE_JOB_DEFINITION = {
  id: SIGN_WITH_USER_CERTIFICATE_JOB_DEFINITION_ID,
  name: 'Sign Document with User Certificate',
  version: SIGN_WITH_USER_CERTIFICATE_JOB_DEFINITION_VERSION,
  trigger: {
    name: SIGN_WITH_USER_CERTIFICATE_JOB_DEFINITION_ID,
    schema: undefined,
  },
  handler: async ({
    payload,
    io,
  }: {
    payload: { envelopeId: string; recipientId: number; userId: number; fieldId?: number };
    io: JobRunIO;
  }) => {
    const { envelopeId, recipientId, userId, fieldId } = payload;

    // Check if OpenXPKI is enabled
    if (!isOpenXPKIEnabled()) {
      io.logger.info('OpenXPKI not enabled, skipping user certificate signing');
      return { success: true, skipped: true };
    }

    io.logger.info(
      `Signing document ${envelopeId} with user certificate for recipient ${recipientId}`,
    );

    try {
      // Get envelope and recipient info
      const envelope = await prisma.envelope.findFirstOrThrow({
        where: { id: envelopeId },
        include: {
          envelopeItems: {
            include: {
              documentData: true,
            },
          },
          recipients: {
            where: { id: recipientId },
          },
        },
      });

      const recipient = envelope.recipients[0];
      if (!recipient) {
        throw new AppError(AppErrorCode.NOT_FOUND, {
          message: `Recipient ${recipientId} not found`,
        });
      }

      // Get user certificate
      const userCertificate = await getActiveUserCertificate({
        userId,
        includeData: true,
      });

      if (!userCertificate) {
        io.logger.info(
          `User ${userId} does not have an active certificate, skipping digital signature`,
        );
        return { success: true, skipped: true, reason: 'no_certificate' };
      }

      // Get the first envelope item (multi-item signing TBD)
      const envelopeItem = envelope.envelopeItems[0];
      if (!envelopeItem) {
        throw new AppError(AppErrorCode.NOT_FOUND, {
          message: 'No envelope items found',
        });
      }

      // Load current PDF
      const pdfBytes = await getFileServerSide(envelopeItem.documentData);
      const pdf = await PDF.load(pdfBytes);

      // Sign PDF incrementally
      const signedPdfBuffer = await signPdfWithUserCertificate({
        pdf,
        userId,
        recipientName: recipient.name || recipient.email,
        reason: `Signed by ${recipient.name || recipient.email}`,
      });

      // Upload signed PDF and update envelope item
      const signedDocumentData = await putPdfFileServerSide({
        name: 'signed-document.pdf',
        type: 'application/pdf',
        arrayBuffer: async () =>
          Promise.resolve(
            signedPdfBuffer.buffer.slice(
              signedPdfBuffer.byteOffset,
              signedPdfBuffer.byteOffset + signedPdfBuffer.byteLength,
            ),
          ),
      });

      // Update envelope item to point to the newly signed PDF
      await prisma.envelopeItem.updateMany({
        where: {
          envelopeId,
        },
        data: {
          documentDataId: signedDocumentData.id,
        },
      });

      io.logger.info(`Updated envelope item with signed PDF`);

      // Record digital signature
      const signatureIndex = await getNextSignatureIndex(envelopeId);

      await recordDigitalSignature({
        envelopeId,
        recipientId,
        fieldId,
        userCertificateId: userCertificate.id,
        signatureIndex,
        signatureData: {
          location: `User ID: ${userId}`,
          reason: `Signed by ${recipient.name || recipient.email}`,
          contactInfo: recipient.email,
        },
      });

      io.logger.info(`Digital signature applied successfully for recipient ${recipientId}`);

      return {
        success: true,
        certificateId: userCertificate.id,
        serialNumber: userCertificate.serialNumber,
        signatureIndex,
      };
    } catch (error) {
      io.logger.error(
        `Failed to apply digital signature: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      // Don't throw - continue workflow even if digital signing fails
      // This ensures documents can still be completed even if cert provisioning fails
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
} satisfies TSignWithUserCertificateJobDefinition;
