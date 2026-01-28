import { env } from '../../utils/env';
import type { OpenXPKIConfig } from './types';
import { ZOpenXPKIConfigSchema } from './types';

/**
 * Get OpenXPKI configuration from environment variables
 */
export const getOpenXPKIConfig = (): OpenXPKIConfig => {
  const config = {
    scepUrl: env('OPENXPKI_SCEP_URL') || 'http://127.0.0.1:8080/scep/generic',
    challengePassword: env('OPENXPKI_CHALLENGE_PASSWORD') || 'SecretChallenge',
    profileName: env('OPENXPKI_PROFILE_NAME') || 'user',
    organizationName: env('OPENXPKI_ORGANIZATION_NAME') || 'Signdex SDN BHD',
  };

  return ZOpenXPKIConfigSchema.parse(config);
};

/**
 * Check if OpenXPKI integration is enabled
 */
export const isOpenXPKIEnabled = (): boolean => {
  try {
    const config = getOpenXPKIConfig();
    return !!config.scepUrl && !!config.challengePassword;
  } catch {
    return false;
  }
};
