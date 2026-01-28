import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { CheckCircle2, Clock, ShieldCheck, XCircle } from 'lucide-react';
import { match } from 'ts-pattern';

import { trpc } from '@documenso/trpc/react';
import { Alert, AlertDescription, AlertTitle } from '@documenso/ui/primitives/alert';
import { Button } from '@documenso/ui/primitives/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@documenso/ui/primitives/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@documenso/ui/primitives/table';
import { useToast } from '@documenso/ui/primitives/use-toast';

import { SettingsHeader } from '~/components/general/settings-header';

export function meta() {
  return [{ title: 'Digital Certificates - Settings' }];
}

export default function UserCertificatesPage() {
  const { _ } = useLingui();
  const { toast } = useToast();

  const {
    data: certificates = [],
    isLoading,
    refetch,
  } = trpc.userCertificate.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const { data: activeCertificate } = trpc.userCertificate.getActive.useQuery();

  const { mutateAsync: provisionCertificate, isPending: isProvisioning } =
    trpc.userCertificate.provision.useMutation();

  const { mutateAsync: revokeCertificate } = trpc.userCertificate.revoke.useMutation();

  const handleProvisionCertificate = async () => {
    try {
      await provisionCertificate();

      toast({
        title: _(msg`Success`),
        description: _(msg`Certificate provisioned successfully`),
      });

      await refetch();
    } catch (error) {
      toast({
        title: _(msg`Error`),
        description: _(msg`Failed to provision certificate`),
        variant: 'destructive',
      });
    }
  };

  const handleRevokeCertificate = async (certificateId: string) => {
    try {
      await revokeCertificate({
        certificateId,
        reason: 'cessationOfOperation',
      });

      toast({
        title: _(msg`Success`),
        description: _(msg`Certificate revoked successfully`),
      });

      await refetch();
    } catch (error) {
      toast({
        title: _(msg`Error`),
        description: _(msg`Failed to revoke certificate`),
        variant: 'destructive',
      });
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(date));
  };

  const getStatusIcon = (status: string) => {
    return match(status)
      .with('ACTIVE', () => <CheckCircle2 className="h-4 w-4 text-green-600" />)
      .with('EXPIRED', () => <Clock className="h-4 w-4 text-orange-600" />)
      .with('REVOKED', () => <XCircle className="h-4 w-4 text-red-600" />)
      .with('PENDING', () => <Clock className="h-4 w-4 text-blue-600" />)
      .otherwise(() => null);
  };

  return (
    <div>
      <SettingsHeader
        title={_(msg`Digital Certificates`)}
        subtitle={_(msg`Manage your digital certificates for signing documents`)}
      >
        <Button
          onClick={handleProvisionCertificate}
          disabled={isProvisioning || !!activeCertificate}
        >
          <ShieldCheck className="mr-2 h-4 w-4" />
          {isProvisioning ? <Trans>Provisioning...</Trans> : <Trans>Request New Certificate</Trans>}
        </Button>
      </SettingsHeader>

      <div className="mt-6 space-y-6">
        {activeCertificate && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>
              <Trans>Active Certificate</Trans>
            </AlertTitle>
            <AlertDescription>
              <Trans>
                You have an active digital certificate. All your signatures will be digitally signed
                with this certificate.
              </Trans>
              <div className="mt-2 text-sm">
                <p>
                  <strong>
                    <Trans>Serial Number:</Trans>
                  </strong>{' '}
                  {activeCertificate.serialNumber}
                </p>
                <p>
                  <strong>
                    <Trans>Expires:</Trans>
                  </strong>{' '}
                  {formatDate(activeCertificate.expiresAt)}
                </p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {!activeCertificate && !isLoading && certificates.length === 0 && (
          <Alert>
            <AlertTitle>
              <Trans>No Certificates</Trans>
            </AlertTitle>
            <AlertDescription>
              <Trans>
                You don't have any digital certificates yet. Click "Request New Certificate" to get
                started.
              </Trans>
            </AlertDescription>
          </Alert>
        )}

        {certificates.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>
                <Trans>Certificate History</Trans>
              </CardTitle>
              <CardDescription>
                <Trans>
                  View all your digital certificates, including active, expired, and revoked ones
                </Trans>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Trans>Status</Trans>
                    </TableHead>
                    <TableHead>
                      <Trans>Serial Number</Trans>
                    </TableHead>
                    <TableHead>
                      <Trans>Common Name</Trans>
                    </TableHead>
                    <TableHead>
                      <Trans>Issued</Trans>
                    </TableHead>
                    <TableHead>
                      <Trans>Expires</Trans>
                    </TableHead>
                    <TableHead>
                      <Trans>Actions</Trans>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {certificates.map((cert) => (
                    <TableRow key={cert.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(cert.status)}
                          <span className="capitalize">{cert.status.toLowerCase()}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{cert.serialNumber}</TableCell>
                      <TableCell>{cert.commonName}</TableCell>
                      <TableCell>{formatDate(cert.issuedAt)}</TableCell>
                      <TableCell>{formatDate(cert.expiresAt)}</TableCell>
                      <TableCell>
                        {cert.status === 'ACTIVE' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => handleRevokeCertificate(cert.id)}
                          >
                            <Trans>Revoke</Trans>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>
              <Trans>About Digital Certificates</Trans>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              <Trans>
                Digital certificates are used to cryptographically sign documents, providing
                non-repudiation and ensuring the authenticity of your signatures.
              </Trans>
            </p>
            <p>
              <Trans>
                When you sign a document, your digital certificate is automatically applied in
                addition to your visual signature, making it legally binding and tamper-evident.
              </Trans>
            </p>
            <p>
              <Trans>
                Certificates are automatically provisioned from our OpenXPKI server when you sign
                your first document. Each certificate is valid for 1 year.
              </Trans>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
