import { z } from 'zod';

import { getUserCertificates } from '@documenso/lib/server-only/user-certificate/get-user-certificate';

import { authenticatedProcedure, router } from '../trpc';

export const userCertificateRouter = router({
  /**
   * List all certificates for the current user
   */
  list: authenticatedProcedure.query(async ({ ctx }) => {
    const { user } = ctx;

    return await getUserCertificates(user.id);
  }),

  /**
   * Get active certificate for current user
   */
  getActive: authenticatedProcedure.query(async ({ ctx }) => {
    const { user } = ctx;

    const { getActiveUserCertificate } = await import(
      '@documenso/lib/server-only/user-certificate/get-user-certificate'
    );

    return await getActiveUserCertificate({
      userId: user.id,
      includeData: false, // Don't return certificate data to client
    });
  }),

  /**
   * Revoke a certificate
   */
  revoke: authenticatedProcedure
    .input(
      z.object({
        certificateId: z.string(),
        reason: z
          .enum(['keyCompromise', 'affiliationChanged', 'superseded', 'cessationOfOperation'])
          .optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { user } = ctx;
      const { certificateId, reason } = input;

      const { revokeUserCertificate } = await import(
        '@documenso/lib/server-only/user-certificate/revoke-user-certificate'
      );

      return await revokeUserCertificate({
        certificateId,
        userId: user.id,
        reason,
      });
    }),

  /**
   * Request a new certificate (manually trigger provisioning)
   */
  provision: authenticatedProcedure.mutation(async ({ ctx }) => {
    const { user } = ctx;

    const { provisionUserCertificate } = await import(
      '@documenso/lib/server-only/user-certificate/provision-user-certificate'
    );

    return await provisionUserCertificate({
      userId: user.id,
      email: user.email,
      name: user.name || user.email,
    });
  }),
});
