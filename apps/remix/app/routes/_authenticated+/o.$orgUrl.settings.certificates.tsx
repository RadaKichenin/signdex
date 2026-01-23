import { useState } from 'react';

import { Trans, msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { Loader, Trash, Upload } from 'lucide-react';
import { useParams } from 'react-router';

import { trpc } from '@documenso/trpc/react';
import { Button } from '@documenso/ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@documenso/ui/primitives/dialog';
import { FormErrorMessage } from '@documenso/ui/primitives/form/form-error-message';
import { Input } from '@documenso/ui/primitives/input';
import { Label } from '@documenso/ui/primitives/label';
import { useToast } from '@documenso/ui/primitives/use-toast';

import { SettingsHeader } from '~/components/general/settings-header';

export default function OrganisationSettingsCertificatesPage() {
  const params = useParams();
  const { _ } = useLingui();
  const { toast } = useToast();

  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [certificateName, setCertificateName] = useState('');
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [certificatePassphrase, setCertificatePassphrase] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const utils = trpc.useUtils();

  // Get organisation session to extract teamId
  const { data: orgSession } = trpc.organisation.internal.getOrganisationSession.useQuery();

  const currentOrg = orgSession?.find((org) => org.url === params.orgUrl);
  const teamId = currentOrg?.teams?.[0]?.id;

  const { data: certificates, isLoading } = trpc.certificate.list.useQuery(
    { teamId },
    { enabled: !!teamId },
  );

  const { mutateAsync: uploadCertificate, isPending: isUploading } =
    trpc.certificate.upload.useMutation();

  const { mutateAsync: deleteCertificate } = trpc.certificate.delete.useMutation();

  const { mutateAsync: setDefaultCertificate } = trpc.certificate.setDefault.useMutation();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.p12')) {
        setUploadError('Please select a .p12 certificate file');
        setCertificateFile(null);
        return;
      }
      setCertificateFile(file);
      setUploadError('');
    }
  };

  const handleUpload = async () => {
    if (!certificateFile || !certificateName) {
      setUploadError('Please provide certificate name and file');
      return;
    }

    try {
      const arrayBuffer = await certificateFile.arrayBuffer();
      // Convert ArrayBuffer to base64 using browser-compatible method
      const uint8Array = new Uint8Array(arrayBuffer);
      let binaryString = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binaryString += String.fromCharCode(uint8Array[i]);
      }
      const base64Data = btoa(binaryString);

      if (!teamId) {
        setUploadError('Team not found');
        return;
      }

      await uploadCertificate({
        teamId,
        name: certificateName,
        data: base64Data,
        passphrase: certificatePassphrase,
        isDefault,
      });

      toast({
        title: _(msg`Success`),
        description: _(msg`Certificate uploaded successfully`),
      });

      // Reset form
      setCertificateName('');
      setCertificateFile(null);
      setCertificatePassphrase('');
      setIsDefault(false);
      setUploadError('');
      setIsUploadDialogOpen(false);

      await utils.certificate.list.invalidate();
    } catch (error) {
      toast({
        title: _(msg`Error`),
        description: _(msg`Failed to upload certificate`),
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (certificateId: string) => {
    if (!confirm(_(msg`Are you sure you want to delete this certificate?`))) {
      return;
    }

    if (!teamId) {
      return;
    }

    try {
      await deleteCertificate({ teamId, certificateId });

      toast({
        title: _(msg`Success`),
        description: _(msg`Certificate deleted successfully`),
      });

      await utils.certificate.list.invalidate();
    } catch (error) {
      toast({
        title: _(msg`Error`),
        description: _(msg`Failed to delete certificate`),
        variant: 'destructive',
      });
    }
  };

  const handleSetDefault = async (certificateId: string) => {
    if (!teamId) {
      return;
    }

    try {
      await setDefaultCertificate({ teamId, certificateId });

      toast({
        title: _(msg`Success`),
        description: _(msg`Default certificate updated`),
      });

      await utils.certificate.list.invalidate();
    } catch (error) {
      toast({
        title: _(msg`Error`),
        description: _(msg`Failed to set default certificate`),
        variant: 'destructive',
      });
    }
  };

  return (
    <div>
      <SettingsHeader
        title={_(msg`Signing Certificates`)}
        subtitle={_(
          msg`Manage .p12 certificates used for signing documents. Upload multiple certificates and select which one to use for each document.`,
        )}
      >
        <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Upload className="mr-2 h-4 w-4" />
              <Trans>Upload Certificate</Trans>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>
                <Trans>Upload Signing Certificate</Trans>
              </DialogTitle>
              <DialogDescription>
                <Trans>
                  Upload a .p12 certificate file with its passphrase. This certificate will be used
                  to sign documents.
                </Trans>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="certificateName">
                  <Trans>Certificate Name</Trans>
                </Label>
                <Input
                  id="certificateName"
                  value={certificateName}
                  onChange={(e) => setCertificateName(e.target.value)}
                  placeholder={_(msg`e.g., Company Certificate 2024`)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="certificateFile">
                  <Trans>Certificate File (.p12)</Trans>
                </Label>
                <Input id="certificateFile" type="file" accept=".p12" onChange={handleFileChange} />
                {certificateFile && (
                  <p className="text-sm text-muted-foreground">{certificateFile.name}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="certificatePassphrase">
                  <Trans>Passphrase</Trans>
                </Label>
                <Input
                  id="certificatePassphrase"
                  type="password"
                  value={certificatePassphrase}
                  onChange={(e) => setCertificatePassphrase(e.target.value)}
                  placeholder={_(msg`Enter certificate passphrase`)}
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="h-4 w-4"
                />
                <Label htmlFor="isDefault" className="cursor-pointer">
                  <Trans>Set as default certificate</Trans>
                </Label>
              </div>

              {uploadError && <FormErrorMessage error={{ message: uploadError }} />}
            </div>

            <DialogFooter>
              <Button variant="secondary" onClick={() => setIsUploadDialogOpen(false)}>
                <Trans>Cancel</Trans>
              </Button>
              <Button onClick={handleUpload} disabled={isUploading || !certificateFile}>
                {isUploading && <Loader className="mr-2 h-4 w-4 animate-spin" />}
                <Trans>Upload</Trans>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SettingsHeader>

      <div className="mt-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : certificates && certificates.length > 0 ? (
          <div className="space-y-4">
            {certificates.map(
              (cert: { id: string; name: string; isDefault: boolean; createdAt: Date }) => (
                <div
                  key={cert.id}
                  className="flex items-center justify-between rounded-lg border border-border p-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{cert.name}</h3>
                      {cert.isDefault && (
                        <span className="rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                          <Trans>Default</Trans>
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      <Trans>Uploaded {new Date(cert.createdAt).toLocaleDateString()}</Trans>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {!cert.isDefault && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => handleSetDefault(cert.id)}
                      >
                        <Trans>Set as Default</Trans>
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={async () => handleDelete(cert.id)}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ),
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Upload className="mb-4 h-12 w-12" />
            <p className="text-lg font-medium">
              <Trans>No certificates uploaded</Trans>
            </p>
            <p className="text-sm">
              <Trans>Upload a .p12 certificate to start signing documents</Trans>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
