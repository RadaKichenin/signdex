import { TRPCError } from '@trpc/server';

import { prisma } from '@documenso/prisma';

import { decryptData, encryptData, encryptString } from './encryption';

export type UploadCertificateOptions = {
  teamId: number;
  name: string;
  data: Buffer;
  passphrase: string;
  isDefault?: boolean;
};

export const uploadCertificate = async ({
  teamId,
  name,
  data,
  passphrase,
  isDefault = false,
}: UploadCertificateOptions) => {
  // Validate that the certificate is a valid .p12 file
  if (!data || data.length === 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Certificate file is required',
    });
  }

  // If setting as default, unset other defaults
  if (isDefault) {
    await prisma.certificate.updateMany({
      where: {
        teamId,
        isDefault: true,
      },
      data: {
        isDefault: false,
      },
    });
  }

  const encryptedData = encryptData(data);
  const encryptedPassphrase = encryptString(passphrase);

  return await prisma.certificate.create({
    data: {
      teamId,
      name,
      data: encryptedData,
      passphrase: encryptedPassphrase,
      isDefault,
    },
    select: {
      id: true,
      name: true,
      isDefault: true,
      createdAt: true,
      updatedAt: true,
    },
  });
};

export type GetCertificatesOptions = {
  teamId: number;
};

export const getCertificates = async ({ teamId }: GetCertificatesOptions) => {
  return await prisma.certificate.findMany({
    where: {
      teamId,
    },
    select: {
      id: true,
      name: true,
      isDefault: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [
      {
        isDefault: 'desc',
      },
      {
        createdAt: 'desc',
      },
    ],
  });
};

export type GetCertificateDataOptions = {
  certificateId: string;
  teamId: number;
};

export const getCertificateData = async ({ certificateId, teamId }: GetCertificateDataOptions) => {
  const certificate = await prisma.certificate.findFirst({
    where: {
      id: certificateId,
      teamId,
    },
  });

  if (!certificate) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Certificate not found',
    });
  }

  return {
    data: decryptData(certificate.data),
    passphrase: decryptString(certificate.passphrase),
  };
};

export type DeleteCertificateOptions = {
  certificateId: string;
  teamId: number;
};

export const deleteCertificate = async ({ certificateId, teamId }: DeleteCertificateOptions) => {
  const certificate = await prisma.certificate.findFirst({
    where: {
      id: certificateId,
      teamId,
    },
  });

  if (!certificate) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Certificate not found',
    });
  }

  await prisma.certificate.delete({
    where: {
      id: certificateId,
    },
  });

  return { success: true };
};

export type SetDefaultCertificateOptions = {
  certificateId: string;
  teamId: number;
};

export const setDefaultCertificate = async ({
  certificateId,
  teamId,
}: SetDefaultCertificateOptions) => {
  const certificate = await prisma.certificate.findFirst({
    where: {
      id: certificateId,
      teamId,
    },
  });

  if (!certificate) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Certificate not found',
    });
  }

  // Unset other defaults
  await prisma.certificate.updateMany({
    where: {
      teamId,
      isDefault: true,
    },
    data: {
      isDefault: false,
    },
  });

  // Set new default
  return await prisma.certificate.update({
    where: {
      id: certificateId,
    },
    data: {
      isDefault: true,
    },
    select: {
      id: true,
      name: true,
      isDefault: true,
      createdAt: true,
      updatedAt: true,
    },
  });
};
