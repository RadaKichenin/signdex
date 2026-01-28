import { provisionUserCertificate } from '../../../server-only/user-certificate/provision-user-certificate';
import type { JobDefinition, JobRunIO } from '../../client/_internal/job';

export const PROVISION_USER_CERTIFICATE_JOB_DEFINITION_ID = 'user-certificate.provision' as const;
export const PROVISION_USER_CERTIFICATE_JOB_DEFINITION_VERSION = '1.0.0' as const;

export type TProvisionUserCertificateJobDefinition = JobDefinition<
  typeof PROVISION_USER_CERTIFICATE_JOB_DEFINITION_ID,
  {
    userId: number;
    email: string;
    name: string;
  }
>;

export const PROVISION_USER_CERTIFICATE_JOB_DEFINITION = {
  id: PROVISION_USER_CERTIFICATE_JOB_DEFINITION_ID,
  name: 'Provision User Certificate',
  version: PROVISION_USER_CERTIFICATE_JOB_DEFINITION_VERSION,
  trigger: {
    name: PROVISION_USER_CERTIFICATE_JOB_DEFINITION_ID,
    schema: undefined,
  },
  handler: async ({
    payload,
    io,
  }: {
    payload: { userId: number; email: string; name: string };
    io: JobRunIO;
  }) => {
    const { userId, email, name } = payload;

    io.logger.info(`Provisioning certificate for user ${userId} (${email})`);

    try {
      const certificate = await provisionUserCertificate({
        userId,
        email,
        name,
      });

      await io.logger.info(
        `Certificate provisioned successfully for user ${userId}: ${certificate.id}`,
      );

      return {
        success: true,
        certificateId: certificate.id,
        serialNumber: certificate.serialNumber,
      };
    } catch (error) {
      await io.logger.error(`Failed to provision certificate for user ${userId}:`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  },
} satisfies TProvisionUserCertificateJobDefinition;
