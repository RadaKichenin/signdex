import type { JobDefinition, JobRunIO } from '../../client/_internal/job';

export const CHECK_CERTIFICATE_EXPIRATION_JOB_DEFINITION_ID =
  'user-certificate.check-expiration' as const;
export const CHECK_CERTIFICATE_EXPIRATION_JOB_DEFINITION_VERSION = '1.0.0' as const;

export type TCheckCertificateExpirationJobDefinition = JobDefinition<
  typeof CHECK_CERTIFICATE_EXPIRATION_JOB_DEFINITION_ID,
  Record<string, never>
>;

/**
 * Background job to check for expiring certificates and mark them as expired
 * Should run daily via cron
 */
export const CHECK_CERTIFICATE_EXPIRATION_JOB_DEFINITION = {
  id: CHECK_CERTIFICATE_EXPIRATION_JOB_DEFINITION_ID,
  name: 'Check Certificate Expiration',
  version: CHECK_CERTIFICATE_EXPIRATION_JOB_DEFINITION_VERSION,
  trigger: {
    name: CHECK_CERTIFICATE_EXPIRATION_JOB_DEFINITION_ID,
    schema: undefined,
  },
  handler: async ({ io }: { io: JobRunIO }) => {
    io.logger.info('Checking for expired certificates');

    try {
      const { prisma } = await import('@documenso/prisma');
      const { UserCertificateStatus } = await import('@prisma/client');

      // Find all active certificates that have expired
      const expiredCerts = await prisma.userCertificate.findMany({
        where: {
          status: UserCertificateStatus.ACTIVE,
          expiresAt: {
            lt: new Date(),
          },
        },
        select: {
          id: true,
          userId: true,
          serialNumber: true,
          expiresAt: true,
        },
      });

      if (expiredCerts.length === 0) {
        await io.logger.info('No expired certificates found');
        return { success: true, expiredCount: 0 };
      }

      // Mark certificates as expired
      const updateResult = await prisma.userCertificate.updateMany({
        where: {
          id: {
            in: expiredCerts.map((cert) => cert.id),
          },
        },
        data: {
          status: UserCertificateStatus.EXPIRED,
        },
      });

      await io.logger.info(`Marked ${updateResult.count} certificates as expired`);

      // TODO: Send notification to users about expired certificates
      // TODO: Trigger auto-renewal if enabled

      return {
        success: true,
        expiredCount: updateResult.count,
        certificates: expiredCerts.map((cert) => ({
          id: cert.id,
          userId: cert.userId,
          serialNumber: cert.serialNumber,
        })),
      };
    } catch (error) {
      await io.logger.error('Failed to check certificate expiration:', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  },
} satisfies TCheckCertificateExpirationJobDefinition;
