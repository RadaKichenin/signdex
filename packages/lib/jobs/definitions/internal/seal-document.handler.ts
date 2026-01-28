import {
  PDFDocument,
  RotationTypes,
  popGraphicsState,
  pushGraphicsState,
  radiansToDegrees,
  rotateDegrees,
  translate,
} from '@cantoo/pdf-lib';
import { PDF } from '@libpdf/core';
import type { DocumentData, Envelope, EnvelopeItem, Field } from '@prisma/client';
import {
  DocumentStatus,
  EnvelopeType,
  RecipientRole,
  SigningStatus,
  WebhookTriggerEvents,
} from '@prisma/client';
import { nanoid } from 'nanoid';
import path from 'node:path';
import { groupBy } from 'remeda';
import { match } from 'ts-pattern';

import { generateAuditLogPdf } from '@documenso/lib/server-only/pdf/generate-audit-log-pdf';
import { generateCertificatePdf } from '@documenso/lib/server-only/pdf/generate-certificate-pdf';
import { prisma } from '@documenso/prisma';
import { signPdf } from '@documenso/signing';
import { signPdfIncrementally } from '@documenso/signing/strategies/incremental-signing';

import { NEXT_PRIVATE_USE_PLAYWRIGHT_PDF } from '../../../constants/app';
import { PDF_SIZE_A4_72PPI } from '../../../constants/pdf';
import { AppError, AppErrorCode } from '../../../errors/app-error';
import { sendCompletedEmail } from '../../../server-only/document/send-completed-email';
import { getAuditLogsPdf } from '../../../server-only/htmltopdf/get-audit-logs-pdf';
import { getCertificatePdf } from '../../../server-only/htmltopdf/get-certificate-pdf';
import { addRejectionStampToPdf } from '../../../server-only/pdf/add-rejection-stamp-to-pdf';
import { flattenAnnotations } from '../../../server-only/pdf/flatten-annotations';
import { flattenForm } from '../../../server-only/pdf/flatten-form';
import { getPageSize } from '../../../server-only/pdf/get-page-size';
import { insertFieldInPDFV1 } from '../../../server-only/pdf/insert-field-in-pdf-v1';
import { insertFieldInPDFV2 } from '../../../server-only/pdf/insert-field-in-pdf-v2';
import { legacy_insertFieldInPDF } from '../../../server-only/pdf/legacy-insert-field-in-pdf';
import { normalizeSignatureAppearances } from '../../../server-only/pdf/normalize-signature-appearances';
import { getTeamSettings } from '../../../server-only/team/get-team-settings';
import { triggerWebhook } from '../../../server-only/webhooks/trigger/trigger-webhook';
import { DOCUMENT_AUDIT_LOG_TYPE } from '../../../types/document-audit-logs';
import {
  ZWebhookDocumentSchema,
  mapEnvelopeToWebhookDocumentPayload,
} from '../../../types/webhook-payload';
import { prefixedId } from '../../../universal/id';
import { getFileServerSide } from '../../../universal/upload/get-file.server';
import { putPdfFileServerSide } from '../../../universal/upload/put-file.server';
import { fieldsContainUnsignedRequiredField } from '../../../utils/advanced-fields-helpers';
import { isDocumentCompleted } from '../../../utils/document';
import { createDocumentAuditLogData } from '../../../utils/document-audit-logs';
import { mapDocumentIdToSecondaryId } from '../../../utils/envelope';
import type { JobRunIO } from '../../client/_internal/job';
import type { TSealDocumentJobDefinition } from './seal-document';

/**
 * Type guard to check if a value is a record object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export const run = async ({
  payload,
  io,
}: {
  payload: TSealDocumentJobDefinition;
  io: JobRunIO;
}) => {
  const { documentId, sendEmail = true, isResealing = false, requestMetadata } = payload;

  const { envelopeId, envelopeStatus, isRejected } = await io.runTask('seal-document', async () => {
    const envelope = await prisma.envelope.findFirstOrThrow({
      where: {
        type: EnvelopeType.DOCUMENT,
        secondaryId: mapDocumentIdToSecondaryId(documentId),
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        documentMeta: true,
        recipients: true,
        fields: {
          include: {
            signature: true,
          },
        },
        envelopeItems: {
          include: {
            documentData: true,
            field: {
              include: {
                signature: true,
              },
            },
          },
        },
      },
    });

    if (envelope.envelopeItems.length === 0) {
      throw new Error('At least one envelope item required');
    }

    const settings = await getTeamSettings({
      userId: envelope.userId,
      teamId: envelope.teamId,
    });

    // Ensure all CC recipients are marked as signed
    await prisma.recipient.updateMany({
      where: {
        envelopeId: envelope.id,
        role: RecipientRole.CC,
      },
      data: {
        signingStatus: SigningStatus.SIGNED,
      },
    });

    const isComplete =
      envelope.recipients.some((recipient) => recipient.signingStatus === SigningStatus.REJECTED) ||
      envelope.recipients.every(
        (recipient) =>
          recipient.signingStatus === SigningStatus.SIGNED || recipient.role === RecipientRole.CC,
      );

    if (!isComplete) {
      throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
        message: 'Document is not complete',
      });
    }

    let { envelopeItems } = envelope;

    const fields = envelope.fields;

    if (envelopeItems.length < 1) {
      throw new Error(`Document ${envelope.id} has no envelope items`);
    }

    const recipientsWithoutCCers = envelope.recipients.filter(
      (recipient) => recipient.role !== RecipientRole.CC,
    );

    // Determine if the document has been rejected by checking if any recipient has rejected it
    const rejectedRecipient = recipientsWithoutCCers.find(
      (recipient) => recipient.signingStatus === SigningStatus.REJECTED,
    );

    const isRejected = Boolean(rejectedRecipient);

    // Get the rejection reason from the rejected recipient
    const rejectionReason = rejectedRecipient?.rejectionReason ?? '';

    // Skip the field check if the document is rejected
    if (!isRejected && fieldsContainUnsignedRequiredField(fields)) {
      throw new Error(`Document ${envelope.id} has unsigned required fields`);
    }

    if (isResealing) {
      // If we're resealing we want to use the initial data for the document
      // so we aren't placing fields on top of eachother.
      envelopeItems = envelopeItems.map((envelopeItem) => ({
        ...envelopeItem,
        documentData: {
          ...envelopeItem.documentData,
          data: envelopeItem.documentData.initialData,
        },
      }));
    }

    if (!envelope.qrToken) {
      await prisma.envelope.update({
        where: {
          id: envelope.id,
        },
        data: {
          qrToken: prefixedId('qr'),
        },
      });
    }

    let certificateDoc: PDFDocument | null = null;
    let auditLogDoc: PDFDocument | null = null;

    if (settings.includeSigningCertificate || settings.includeAuditLog) {
      const certificatePayload = {
        envelope,
        recipients: envelope.recipients, // Need to use the recipients from envelope which contains ALL recipients.
        fields,
        language: envelope.documentMeta.language,
        envelopeOwner: {
          email: envelope.user.email,
          name: envelope.user.name || '',
        },
        envelopeItems: envelopeItems.map((item) => item.title),
        pageWidth: PDF_SIZE_A4_72PPI.width,
        pageHeight: PDF_SIZE_A4_72PPI.height,
      };

      // Use Playwright-based PDF generation if enabled, otherwise use Konva-based generation.
      // This is a temporary toggle while we validate the Konva-based approach.
      const usePlaywrightPdf = NEXT_PRIVATE_USE_PLAYWRIGHT_PDF();

      const makeCertificatePdf = async () =>
        usePlaywrightPdf
          ? getCertificatePdf({
              documentId,
              language: envelope.documentMeta.language,
            }).then(async (buffer) => PDFDocument.load(buffer))
          : generateCertificatePdf(certificatePayload);

      const makeAuditLogPdf = async () =>
        usePlaywrightPdf
          ? getAuditLogsPdf({
              documentId,
              language: envelope.documentMeta.language,
            }).then(async (buffer) => PDFDocument.load(buffer))
          : generateAuditLogPdf(certificatePayload);

      const [createdCertificatePdf, createdAuditLogPdf] = await Promise.all([
        settings.includeSigningCertificate ? makeCertificatePdf() : null,
        settings.includeAuditLog ? makeAuditLogPdf() : null,
      ]);

      certificateDoc = createdCertificatePdf;
      auditLogDoc = createdAuditLogPdf;
    }

    const newDocumentData: Array<{ oldDocumentDataId: string; newDocumentDataId: string }> = [];

    for (const envelopeItem of envelopeItems) {
      const envelopeItemFields = envelope.envelopeItems.find(
        (item) => item.id === envelopeItem.id,
      )?.field;

      if (!envelopeItemFields) {
        throw new Error(`Envelope item fields not found for envelope item ${envelopeItem.id}`);
      }

      const result = await decorateAndSignPdf({
        envelope,
        envelopeItem,
        envelopeItemFields,
        isRejected,
        rejectionReason,
        certificateDoc,
        auditLogDoc,
      });

      newDocumentData.push(result);
    }

    await prisma.$transaction(async (tx) => {
      for (const { oldDocumentDataId, newDocumentDataId } of newDocumentData) {
        const newData = await tx.documentData.findFirstOrThrow({
          where: {
            id: newDocumentDataId,
          },
        });

        await tx.documentData.update({
          where: {
            id: oldDocumentDataId,
          },
          data: {
            data: newData.data,
          },
        });
      }

      await tx.envelope.update({
        where: {
          id: envelope.id,
        },
        data: {
          status: isRejected ? DocumentStatus.REJECTED : DocumentStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      await tx.documentAuditLog.create({
        data: createDocumentAuditLogData({
          type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_COMPLETED,
          envelopeId: envelope.id,
          requestMetadata,
          user: null,
          data: {
            transactionId: nanoid(),
            ...(isRejected ? { isRejected: true, rejectionReason: rejectionReason } : {}),
          },
        }),
      });
    });

    return {
      envelopeId: envelope.id,
      envelopeStatus: envelope.status,
      isRejected,
    };
  });

  await io.runTask('send-completed-email', async () => {
    let shouldSendCompletedEmail = sendEmail && !isResealing && !isRejected;

    if (isResealing && !isDocumentCompleted(envelopeStatus)) {
      shouldSendCompletedEmail = sendEmail;
    }

    if (shouldSendCompletedEmail) {
      await sendCompletedEmail({
        id: { type: 'envelopeId', id: envelopeId },
        requestMetadata,
      });
    }
  });

  const updatedEnvelope = await prisma.envelope.findFirstOrThrow({
    where: {
      id: envelopeId,
    },
    include: {
      documentMeta: true,
      recipients: true,
    },
  });

  await triggerWebhook({
    event: isRejected
      ? WebhookTriggerEvents.DOCUMENT_REJECTED
      : WebhookTriggerEvents.DOCUMENT_COMPLETED,
    data: ZWebhookDocumentSchema.parse(mapEnvelopeToWebhookDocumentPayload(updatedEnvelope)),
    userId: updatedEnvelope.userId,
    teamId: updatedEnvelope.teamId ?? undefined,
  });
};

type DecorateAndSignPdfOptions = {
  envelope: Pick<
    Envelope,
    'id' | 'title' | 'useLegacyFieldInsertion' | 'internalVersion' | 'teamId'
  > & {
    documentMeta: { certificateId?: string | null } | null;
  };
  envelopeItem: EnvelopeItem & { documentData: DocumentData };
  envelopeItemFields: Field[];
  isRejected: boolean;
  rejectionReason: string;
  certificateDoc: PDFDocument | null;
  auditLogDoc: PDFDocument | null;
};

/**
 * Fetch, normalize, flatten and insert fields into a PDF document.
 */
const decorateAndSignPdf = async ({
  envelope,
  envelopeItem,
  envelopeItemFields,
  isRejected,
  rejectionReason,
  certificateDoc,
  auditLogDoc,
}: DecorateAndSignPdfOptions) => {
  const pdfData = await getFileServerSide(envelopeItem.documentData);

  const pdfDoc = await PDFDocument.load(pdfData);

  // Normalize and flatten layers that could cause issues with the signature
  normalizeSignatureAppearances(pdfDoc);
  await flattenForm(pdfDoc);
  flattenAnnotations(pdfDoc);

  // Add rejection stamp if the document is rejected
  if (isRejected && rejectionReason) {
    await addRejectionStampToPdf(pdfDoc, rejectionReason);
  }

  if (certificateDoc) {
    const certificatePages = await pdfDoc.copyPages(
      certificateDoc,
      certificateDoc.getPageIndices(),
    );

    certificatePages.forEach((page) => {
      pdfDoc.addPage(page);
    });
  }

  if (auditLogDoc) {
    const auditLogPages = await pdfDoc.copyPages(auditLogDoc, auditLogDoc.getPageIndices());

    auditLogPages.forEach((page) => {
      pdfDoc.addPage(page);
    });
  }

  // Handle V1 and legacy insertions.
  if (envelope.internalVersion === 1) {
    for (const field of envelopeItemFields) {
      if (field.inserted) {
        if (envelope.useLegacyFieldInsertion) {
          await legacy_insertFieldInPDF(pdfDoc, field);
        } else {
          await insertFieldInPDFV1(pdfDoc, field);
        }
      }
    }
  }

  // Handle V2 envelope insertions.
  if (envelope.internalVersion === 2) {
    const fieldsGroupedByPage = groupBy(envelopeItemFields, (field) => field.page);

    for (const [pageNumber, fields] of Object.entries(fieldsGroupedByPage)) {
      const page = pdfDoc.getPage(Number(pageNumber) - 1);
      const pageRotation = page.getRotation();

      let { width: pageWidth, height: pageHeight } = getPageSize(page);

      let pageRotationInDegrees = match(pageRotation.type)
        .with(RotationTypes.Degrees, () => pageRotation.angle)
        .with(RotationTypes.Radians, () => radiansToDegrees(pageRotation.angle))
        .exhaustive();

      // Round to the closest multiple of 90 degrees.
      pageRotationInDegrees = Math.round(pageRotationInDegrees / 90) * 90;

      // PDFs can have pages that are rotated, which are correctly rendered in the frontend.
      // However when we load the PDF in the backend, the rotation is applied.
      // To account for this, we swap the width and height for pages that are rotated by 90/270
      // degrees. This is so we can calculate the virtual position the field was placed if it
      // was correctly oriented in the frontend.
      if (pageRotationInDegrees === 90 || pageRotationInDegrees === 270) {
        [pageWidth, pageHeight] = [pageHeight, pageWidth];
      }

      // Rotate the page to the orientation that the react-pdf renders on the frontend.
      // Note: These transformations are undone at the end of the function.
      // If you change this if statement, update the if statement at the end as well
      if (pageRotationInDegrees !== 0) {
        let translateX = 0;
        let translateY = 0;

        switch (pageRotationInDegrees) {
          case 90:
            translateX = pageHeight;
            translateY = 0;
            break;
          case 180:
            translateX = pageWidth;
            translateY = pageHeight;
            break;
          case 270:
            translateX = 0;
            translateY = pageWidth;
            break;
          case 0:
          default:
            translateX = 0;
            translateY = 0;
        }

        page.pushOperators(pushGraphicsState());
        page.pushOperators(translate(translateX, translateY), rotateDegrees(pageRotationInDegrees));
      }

      const renderedPdfOverlay = await insertFieldInPDFV2({
        pageWidth,
        pageHeight,
        fields,
      });

      const [embeddedPage] = await pdfDoc.embedPdf(renderedPdfOverlay);

      // Draw the SVG on the page
      page.drawPage(embeddedPage, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
      });

      // Remove the transformations applied to the page if any were applied.
      if (pageRotationInDegrees !== 0) {
        page.pushOperators(popGraphicsState());
      }
    }
  }

  // Re-flatten the form to handle our checkbox and radio fields that
  // create native arcoFields
  await flattenForm(pdfDoc);

  const pdfBytes = await pdfDoc.save();

  // Convert to @libpdf/core PDF object for signing
  let pdfForSigning = await PDF.load(pdfBytes);

  // Re-apply user digital signatures that were lost during PDF reconstruction
  // Query all digital signatures for this envelope
  const existingSignatures = await prisma.digitalSignature.findMany({
    where: {
      envelopeId: envelope.id,
    },
    include: {
      userCertificate: true,
      recipient: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      signedAt: 'asc',
    },
  });

  console.log('[SealDocument] Re-applying user signatures after PDF reconstruction:', {
    signatureCount: existingSignatures.length,
  });

  // Re-apply each user signature incrementally
  for (const signature of existingSignatures) {
    try {
      if (!signature.userCertificate) {
        console.error(
          '[SealDocument] User certificate relation not loaded for signature:',
          signature.id,
        );
        continue;
      }

      const { getActiveUserCertificate } = await import('../../../server-only/user-certificate');

      const userCertificate = await getActiveUserCertificate({
        userId: signature.userCertificate.userId,
        includeData: true,
      });

      if (!userCertificate) {
        console.error('[SealDocument] User certificate not found for signature:', signature.id);
        continue;
      }

      const recipientName = signature.recipient?.name || signature.recipient?.email || 'Unknown';

      // Extract signature metadata from JSON field
      const rawMetadata = signature.signatureData;
      const signatureMetadata = isRecord(rawMetadata) ? rawMetadata : {};
      const metadataReason =
        typeof signatureMetadata.reason === 'string' ? signatureMetadata.reason : undefined;
      const metadataLocation =
        typeof signatureMetadata.location === 'string' ? signatureMetadata.location : undefined;
      const metadataContactInfo =
        typeof signatureMetadata.contactInfo === 'string'
          ? signatureMetadata.contactInfo
          : undefined;

      // Re-apply user signature incrementally with unique field name
      const signedBytesResult = await signPdfIncrementally({
        pdf: pdfForSigning,
        certificateData: Buffer.from(userCertificate.certificateData!),
        passphrase: userCertificate.passphrase!,
        certificateName: userCertificate.commonName || 'User Certificate',
        reason: metadataReason || `Signed by ${recipientName}`,
        location: metadataLocation,
        contactInfo: metadataContactInfo,
        signatureIndex: signature.signatureIndex, // Unique field name
      });

      const signedBytes = Buffer.isBuffer(signedBytesResult)
        ? signedBytesResult
        : Buffer.from(signedBytesResult);

      // Reload PDF with the newly added signature for next iteration
      pdfForSigning = await PDF.load(Buffer.from(signedBytes));

      console.log('[SealDocument] Re-applied user signature:', {
        signatureId: signature.id,
        signatureIndex: signature.signatureIndex,
        signer: recipientName,
      });
    } catch (error) {
      console.error('[SealDocument] Failed to re-apply user signature:', {
        signatureId: signature.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Continue with other signatures even if one fails
    }
  }

  // Use incremental signing to add system seal after user signatures
  let pdfBuffer: Buffer;

  try {
    // Try to load system seal certificate for incremental signing
    const certificateModule = await import('../../../server-only/certificate/certificate');
    const envModule = await import('../../../utils/env');
    const getCertificateData = certificateModule.getCertificateData;
    const envFn = envModule.env;

    let cert: Buffer | null = null;
    let passphrase: string | undefined;
    let certificateName = 'System Seal';

    // Try to load certificate from database if certificateId is provided
    if (envelope.documentMeta?.certificateId && envelope.teamId) {
      try {
        const certificate = await prisma.certificate.findFirst({
          where: {
            id: envelope.documentMeta.certificateId,
            teamId: envelope.teamId,
          },
        });

        if (certificate) {
          certificateName = certificate.name;
          const certData = await getCertificateData({
            certificateId: envelope.documentMeta.certificateId,
            teamId: envelope.teamId,
          });
          cert = certData.data;
          passphrase = certData.passphrase;
        }
      } catch (error) {
        console.error('[SealDocument] Failed to load certificate from database:', error);
      }
    }

    // If no certificate from database, try to load default certificate for the team
    if (!cert && envelope.teamId) {
      try {
        const defaultCert = await prisma.certificate.findFirst({
          where: {
            teamId: envelope.teamId,
            isDefault: true,
          },
        });

        if (defaultCert) {
          certificateName = defaultCert.name;
          const certData = await getCertificateData({
            certificateId: defaultCert.id,
            teamId: envelope.teamId,
          });
          cert = certData.data;
          passphrase = certData.passphrase;
        }
      } catch (error) {
        console.error('[SealDocument] Failed to load default certificate:', error);
      }
    }

    // Fall back to environment variable certificate
    if (!cert) {
      const localFileContents = envFn('NEXT_PRIVATE_SIGNING_LOCAL_FILE_CONTENTS');
      const localFilePath = envFn('NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH');

      if (localFileContents) {
        cert = Buffer.from(localFileContents, 'base64');
        passphrase = envFn('NEXT_PRIVATE_SIGNING_PASSPHRASE') || '';
        certificateName = 'Environment Certificate';
        console.log(
          '[SealDocument] Using environment certificate (base64) for incremental signing',
        );
      } else if (localFilePath) {
        // Load from file path
        const fs = await import('node:fs');
        cert = fs.readFileSync(localFilePath);
        passphrase = envFn('NEXT_PRIVATE_SIGNING_PASSPHRASE') || '';
        certificateName = 'Local File Certificate';
        console.log(
          '[SealDocument] Using environment certificate (file path) for incremental signing',
        );
      }
    }

    if (!cert) {
      throw new Error('No certificate available for signing');
    }

    // Passphrase can be empty string for some certificates
    if (passphrase === undefined || passphrase === null) {
      passphrase = '';
    }

    console.log('[SealDocument] Certificate loaded for incremental signing:', {
      certificateName,
      certSize: cert.length,
      hasPassphrase: passphrase.length > 0,
    });

    // Calculate system seal signature index
    const systemSealIndex = existingSignatures.length + 1;

    // Sign incrementally to add system seal after user signatures
    pdfBuffer = await signPdfIncrementally({
      pdf: pdfForSigning,
      certificateData: cert,
      passphrase,
      certificateName,
      reason: 'Document Sealed',
      location: NEXT_PRIVATE_USE_PLAYWRIGHT_PDF() ? 'System' : 'Documenso',
      signatureIndex: systemSealIndex, // Unique field name for system seal
    });

    console.log('[SealDocument] System seal applied with incremental signing');

    // Record system seal as a digital signature
    await prisma.digitalSignature.create({
      data: {
        envelopeId: envelope.id,
        signatureIndex: systemSealIndex,
        signatureData: {
          reason: 'Document Sealed',
          location: NEXT_PRIVATE_USE_PLAYWRIGHT_PDF() ? 'System' : 'Documenso',
          signer: certificateName,
        },
      },
    });

    console.log('[SealDocument] Recorded system seal signature:', {
      signatureIndex: systemSealIndex,
      certificateName,
    });
  } catch (error) {
    console.error(
      '[SealDocument] Incremental signing failed, falling back to regular signing:',
      error,
    );

    // Fall back to regular signing if incremental signing fails
    pdfBuffer = await signPdf({
      pdf: pdfForSigning,
      certificateId: envelope.documentMeta?.certificateId,
      teamId: envelope.teamId,
    });
  }

  const { name } = path.parse(envelopeItem.title);

  // Add suffix based on document status
  const suffix = isRejected ? '_rejected.pdf' : '_signed.pdf';

  const newDocumentData = await putPdfFileServerSide({
    name: `${name}${suffix}`,
    type: 'application/pdf',
    arrayBuffer: async () => Promise.resolve(pdfBuffer),
  });

  // Update envelope item to point to the sealed PDF
  await prisma.envelopeItem.updateMany({
    where: { envelopeId: envelope.id },
    data: { documentDataId: newDocumentData.id },
  });

  console.log('[SealDocument] Updated envelope item with sealed PDF:', {
    envelopeId: envelope.id,
    oldDocumentDataId: envelopeItem.documentData.id,
    newDocumentDataId: newDocumentData.id,
  });

  return {
    oldDocumentDataId: envelopeItem.documentData.id,
    newDocumentDataId: newDocumentData.id,
  };
};
