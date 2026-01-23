import { match } from 'ts-pattern';

import { env } from '@documenso/lib/utils/env';

import { signWithGoogleCloudHSM } from './transports/google-cloud-hsm';
import { signWithLocalCert } from './transports/local-cert';

export type SignOptions = {
  pdf: Buffer;
  certificateId?: string | null;
  teamId?: number;
};

export const signPdf = async ({ pdf, certificateId, teamId }: SignOptions) => {
  const transport = env('NEXT_PRIVATE_SIGNING_TRANSPORT') || 'local';

  return await match(transport)
    .with('local', async () => signWithLocalCert({ pdf, certificateId, teamId }))
    .with('gcloud-hsm', async () => signWithGoogleCloudHSM({ pdf }))
    .otherwise(() => {
      throw new Error(`Unsupported signing transport: ${transport}`);
    });
};
