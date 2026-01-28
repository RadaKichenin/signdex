# OpenXPKI Digital Signatures Implementation

This document describes the implementation of OpenXPKI integration for automatic digital certificate provisioning and multi-signature support in Documenso.

## Overview

This feature enables:
- **Automatic certificate provisioning** from OpenXPKI for each user
- **Multiple digital signatures** on a single PDF (one per recipient + system signature)
- **Correlation** between visual signatures (field signatures) and digital signatures
- **Certificate lifecycle management** (issuance, renewal, revocation)

## Architecture

### Database Schema

#### UserCertificate Model
Stores user-level digital certificates provisioned from OpenXPKI:
- `certificateData`: Encrypted P12 certificate file
- `passphrase`: Encrypted passphrase
- `serialNumber`: Certificate serial number from OpenXPKI
- `status`: ACTIVE, EXPIRED, REVOKED, or PENDING
- `issuedAt`, `expiresAt`: Certificate validity period

#### DigitalSignature Model
Tracks each digital signature applied to a PDF:
- `envelopeId`: Document envelope
- `recipientId`: Which recipient signed (null for system signature)
- `fieldId`: Which signature field this correlates to
- `userCertificateId` or `teamCertificateId`: Which certificate was used
- `signatureIndex`: Order of signature application (1st, 2nd, 3rd...)
- `signatureData`: Metadata (location, reason, contact info)

### Components

#### 1. OpenXPKI Client (`packages/lib/server-only/openxpki/`)
- `client.ts`: SCEP protocol client for certificate operations
- `config.ts`: OpenXPKI configuration management
- `types.ts`: Type definitions

**Key Functions:**
- `requestCertificate()`: Request new certificate from OpenXPKI
- `getCertificateStatus()`: Check certificate status
- `revokeCertificate()`: Revoke a certificate

#### 2. User Certificate Management (`packages/lib/server-only/user-certificate/`)
- `provision-user-certificate.ts`: Auto-provision certificates
- `get-user-certificate.ts`: Retrieve user certificates
- `revoke-user-certificate.ts`: Revoke certificates

#### 3. Digital Signature Tracking (`packages/lib/server-only/digital-signature/`)
- `record-digital-signature.ts`: Record signatures applied to PDFs
- Functions to query and verify digital signatures

#### 4. Incremental PDF Signing (`packages/signing/`)
- `strategies/incremental-signing.ts`: Sign PDFs without invalidating previous signatures
- `transports/user-cert.ts`: Sign using user certificates
- Supports multiple signatures on same document

#### 5. Background Jobs (`packages/lib/jobs/definitions/user-certificate/`)
- `provision-user-certificate.ts`: Provision certificate for new users
- `check-certificate-expiration.ts`: Daily job to mark expired certificates

## Environment Variables

Add these to your `.env` file:

```bash
# OpenXPKI SCEP Configuration
OPENXPKI_SCEP_URL=http://127.0.0.1:8080/scep/generic
OPENXPKI_CHALLENGE_PASSWORD=SecretChallenge
OPENXPKI_PROFILE_NAME=user
OPENXPKI_ORGANIZATION_NAME="Signdex SDN BHD"

# Enable/disable OpenXPKI integration
OPENXPKI_ENABLED=true
```

## Workflow

### Certificate Provisioning
1. User signs up or first signs a document
2. Background job triggers: `provision-user-certificate`
3. Request sent to OpenXPKI via SCEP
4. Certificate (P12) received and encrypted
5. Stored in `UserCertificate` table

### Document Signing Flow
1. **Recipient signs field** (draws/types signature)
   - Visual signature stored in `Signature` table
   - Field marked as `inserted`
   
2. **Digital signature applied**
   - Load user's active certificate
   - Sign PDF incrementally using `signPdfIncrementally()`
   - Record in `DigitalSignature` table with:
     - Link to recipient
     - Link to signature field
     - Certificate used
     - Signature index (order)

3. **Next recipient signs**
   - Repeat process, adding another digital signature
   - Previous signatures remain valid

4. **Final system signature**
   - After all recipients sign
   - System adds final signature using team certificate
   - Document status set to COMPLETED

### Signature Verification
Each PDF now contains:
- **Visual signatures**: Image/typed text on document
- **Digital signatures**: Cryptographic signatures embedded in PDF
- **Audit trail**: `DigitalSignature` table links everything together

## Migration Path

### Phase 1: Foundation (Completed) ✅
- ✅ Database schema
- ✅ OpenXPKI client library
- ✅ User certificate management
- ✅ Incremental signing strategy

### Phase 2: Integration (Next Steps) 🔄
- [ ] Hook certificate provisioning on user registration
- [ ] Integrate digital signing into field signing workflow
- [ ] Update document completion handler
- [ ] TRPC routes for certificate management
- [ ] UI for viewing certificates

### Phase 3: Testing & Validation 🔜
- [ ] Unit tests for OpenXPKI client
- [ ] Integration tests for multi-signature flow
- [ ] E2E tests for complete signing workflow
- [ ] Certificate revocation testing

### Phase 4: Production Hardening 🔜
- [ ] Certificate renewal automation
- [ ] Error handling & retry logic
- [ ] Monitoring & alerting
- [ ] Certificate validation UI
- [ ] LTV (Long Term Validation) support

## Security Considerations

1. **Certificate Encryption**: All certificates encrypted at rest using AES-256
2. **Passphrase Security**: Separate encryption for passphrases
3. **Certificate Validation**: Verify certificate status before signing
4. **Revocation Checks**: Regular checks for revoked certificates
5. **Audit Trail**: Complete logging of all certificate operations

## API Usage Examples

### Provision Certificate for User
```typescript
import { provisionUserCertificate } from '@documenso/lib/server-only/user-certificate';

const certificate = await provisionUserCertificate({
  userId: 123,
  email: 'user@example.com',
  name: 'John Doe',
});
```

### Sign PDF with User Certificate
```typescript
import { signPdfWithUserCertificate } from '@documenso/signing/transports/user-cert';
import { PDF } from '@libpdf/core';

const pdf = await PDF.load(pdfBytes);

const signedPdf = await signPdfWithUserCertificate({
  pdf,
  userId: 123,
  recipientName: 'John Doe',
  reason: 'I approve this document',
});
```

### Record Digital Signature
```typescript
import { recordDigitalSignature, getNextSignatureIndex } from '@documenso/lib/server-only/digital-signature';

const signatureIndex = await getNextSignatureIndex(envelopeId);

await recordDigitalSignature({
  envelopeId: 'envelope_123',
  recipientId: 456,
  fieldId: 789,
  userCertificateId: 'cert_abc',
  signatureIndex,
  signatureData: {
    location: 'User ID: 123',
    reason: 'I approve this document',
    contactInfo: 'user@example.com',
  },
});
```

## Troubleshooting

### Certificate Request Fails
- Check OpenXPKI is running: `curl http://127.0.0.1:8080/scep/generic`
- Verify challenge password is correct
- Check logs: `journalctl -u certmonger -f`

### Signatures Invalid After Signing
- Ensure using incremental signing mode
- Verify certificate chain is complete
- Check for PDF modifications between signatures

### Certificate Expiration Issues
- Run expiration check job manually
- Verify automatic renewal is working
- Check certificate validity dates

## Future Enhancements

1. **Certificate Templates**: Support different certificate types (signing, encryption, etc.)
2. **Hardware Security Modules (HSM)**: Store private keys in HSM
3. **Timestamp Authority**: Add trusted timestamps to signatures
4. **Signature Validation API**: Endpoint to verify document signatures
5. **Certificate Auto-Renewal**: Automatic renewal before expiration
6. **Multi-CA Support**: Support multiple certificate authorities

## References

- [OpenXPKI Documentation](https://openxpki.readthedocs.io/)
- [SCEP Protocol Specification](https://datatracker.ietf.org/doc/html/rfc8894)
- [PDF Digital Signatures (ISO 32000)](https://pdfa.org/resource/iso-32000-pdf/)
- [eIDAS Regulation](https://ec.europa.eu/digital-building-blocks/wikis/display/DIGITAL/eIDAS)
