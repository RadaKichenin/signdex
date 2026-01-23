import * as crypto from 'node:crypto';

import { env } from '@documenso/lib/utils/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;

/**
 * Derives an encryption key from the app secret.
 */
const getEncryptionKey = (salt: Buffer): Buffer => {
  const secret = env('NEXT_PRIVATE_ENCRYPTION_KEY') || env('NEXTAUTH_SECRET') || '';

  if (!secret) {
    throw new Error('NEXT_PRIVATE_ENCRYPTION_KEY or NEXTAUTH_SECRET must be set');
  }

  return crypto.pbkdf2Sync(secret, salt, 100000, 32, 'sha512');
};

/**
 * Encrypts data (certificate file or passphrase).
 */
export const encryptData = (data: Buffer | string): Buffer => {
  const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8');

  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getEncryptionKey(salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(dataBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: [salt][iv][authTag][encrypted]
  return Buffer.concat([salt, iv, authTag, encrypted]);
};

/**
 * Decrypts data (certificate file or passphrase).
 */
export const decryptData = (encryptedData: Buffer): Buffer => {
  const salt = encryptedData.subarray(0, SALT_LENGTH);
  const iv = encryptedData.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = encryptedData.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH,
  );
  const encrypted = encryptedData.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

  const key = getEncryptionKey(salt);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
};

/**
 * Encrypts a string and returns it as a base64-encoded string.
 */
export const encryptString = (data: string): string => {
  return encryptData(Buffer.from(data, 'utf-8')).toString('base64');
};

/**
 * Decrypts a base64-encoded encrypted string.
 */
export const decryptString = (encryptedBase64: string): string => {
  const encryptedData = Buffer.from(encryptedBase64, 'base64');
  return decryptData(encryptedData).toString('utf-8');
};
