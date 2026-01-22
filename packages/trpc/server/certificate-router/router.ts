import { z } from 'zod';

import {
  deleteCertificate,
  getCertificates,
  setDefaultCertificate,
  uploadCertificate,
} from '@documenso/lib/server-only/certificate/certificate';

import { authenticatedProcedure, router } from '../trpc';

export const certificateRouter = router({
  list: authenticatedProcedure.query(async ({ ctx }) => {
    const { teamId } = ctx;

    if (!teamId) {
      throw new Error('Team ID is required');
    }

    return await getCertificates({ teamId });
  }),

  upload: authenticatedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        data: z.string(), // Base64 encoded certificate file
        passphrase: z.string(),
        isDefault: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { teamId } = ctx;

      if (!teamId) {
        throw new Error('Team ID is required');
      }

      const { name, data, passphrase, isDefault } = input;

      // Decode base64 data
      const dataBuffer = Buffer.from(data, 'base64');

      return await uploadCertificate({
        teamId,
        name,
        data: dataBuffer,
        passphrase,
        isDefault,
      });
    }),

  delete: authenticatedProcedure
    .input(
      z.object({
        certificateId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { teamId } = ctx;

      if (!teamId) {
        throw new Error('Team ID is required');
      }

      return await deleteCertificate({
        certificateId: input.certificateId,
        teamId,
      });
    }),

  setDefault: authenticatedProcedure
    .input(
      z.object({
        certificateId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { teamId } = ctx;

      if (!teamId) {
        throw new Error('Team ID is required');
      }

      return await setDefaultCertificate({
        certificateId: input.certificateId,
        teamId,
      });
    }),
});
