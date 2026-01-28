# OpenXPKI Integration Testing Guide

## ✅ Setup Complete

Your OpenXPKI integration is now configured and running! Here's how to test it.

## Current Configuration

From your `.env` file:
- **OpenXPKI Enabled**: `true`
- **SCEP Endpoint**: `http://127.0.0.1:8080/scep/generic`
- **Challenge Password**: `SecretChallenge`
- **Profile Name**: `user`
- **Organization**: `Signdex AI`

## Application Status

- ✅ Database migration applied (UserCertificate & DigitalSignature tables)
- ✅ Application built with OpenXPKI integration
- ✅ Service running on port 3000
- ✅ OpenXPKI SCEP server accessible

## Testing Steps

### 1. Access the Certificate Management Page

**URL**: https://demo.signdex.ai/settings/certificates

This page should show:
- A button to "Request New Certificate"
- Information about digital certificates
- Empty certificate list (if you haven't provisioned any yet)

### 2. Test Automatic Certificate Provisioning

**Scenario**: When a user signs their first document, a certificate should be automatically provisioned.

**Steps**:
1. Create a new document with yourself as a recipient
2. Add a signature field
3. Sign the document (place your signature)
4. Check background job logs:
   ```bash
   journalctl -u documenso -f | grep -i "provision\|certificate"
   ```
5. Verify certificate was created in the database:
   ```bash
   psql -U documenso -d documenso -c "SELECT id, status, \"serialNumber\", \"commonName\" FROM \"UserCertificate\";"
   ```

**Expected Result**:
- Job `provision-user-certificate` should trigger
- Certificate should be created with status `ACTIVE`
- You should see logs showing: `"Provisioning certificate for user..."`

### 3. Test Digital Signature Application

**Scenario**: After a recipient completes their signature, a digital signature should be applied to the PDF.

**Steps**:
1. Complete the document (click "Complete" after signing)
2. Check background job logs:
   ```bash
   journalctl -u documenso -f | grep -i "sign.*certificate\|digital"
   ```
3. Verify digital signature was recorded:
   ```bash
   psql -U documenso -d documenso -c "SELECT * FROM \"DigitalSignature\" ORDER BY \"createdAt\" DESC LIMIT 1;"
   ```
4. Download the signed PDF
5. Open in Adobe Acrobat Reader
6. Check the signature panel (should show digital signatures)

**Expected Result**:
- Job `sign-with-user-certificate` should trigger
- DigitalSignature record created in database
- PDF contains cryptographic signature (visible in Adobe Reader)

### 4. Test Multiple Signatures

**Scenario**: Document with multiple recipients should have multiple digital signatures.

**Steps**:
1. Create a document with 2-3 recipients
2. Have each recipient sign the document
3. After each signature, verify:
   ```bash
   psql -U documenso -d documenso -c "SELECT \"signatureIndex\", \"recipientId\" FROM \"DigitalSignature\" WHERE \"envelopeId\" = 'YOUR_ENVELOPE_ID' ORDER BY \"signatureIndex\";"
   ```
4. Download final PDF
5. Verify all signatures in Adobe Reader

**Expected Result**:
- One DigitalSignature record per recipient
- Each signature has incrementing `signatureIndex` (0, 1, 2...)
- All signatures remain valid in PDF (no invalidation)

### 5. Test Certificate Management UI

**Steps**:
1. Go to https://demo.signdex.ai/settings/certificates
2. View your certificate list
3. Check certificate details (serial number, expiration, status)
4. Try revoking a certificate
5. Try requesting a new certificate manually

**Expected Result**:
- Certificates display correctly
- Active certificate highlighted
- Revocation works (status changes to REVOKED)
- Manual provisioning creates new certificate

## Verification Queries

### Check Certificate Status
```sql
SELECT 
  id, 
  "userId", 
  status, 
  "serialNumber", 
  "commonName",
  "issuedAt",
  "expiresAt"
FROM "UserCertificate"
ORDER BY "createdAt" DESC;
```

### Check Digital Signatures
```sql
SELECT 
  ds.id,
  ds."signatureIndex",
  e.title as document,
  r.email as signer,
  ds."signatureData",
  ds."createdAt"
FROM "DigitalSignature" ds
JOIN "Envelope" e ON e.id = ds."envelopeId"
JOIN "Recipient" r ON r.id = ds."recipientId"
ORDER BY ds."createdAt" DESC;
```

### Check User with Certificate
```sql
SELECT 
  u.email,
  u.name,
  uc.status as cert_status,
  uc."serialNumber",
  COUNT(ds.id) as signatures_made
FROM "User" u
LEFT JOIN "UserCertificate" uc ON uc."userId" = u.id
LEFT JOIN "DigitalSignature" ds ON ds."userCertificateId" = uc.id
GROUP BY u.id, uc.id;
```

## Troubleshooting

### Certificate Not Provisioning

**Check**:
1. OpenXPKI server is running:
   ```bash
   curl -I http://127.0.0.1:8080/scep/generic
   ```
2. Challenge password is correct in `.env`
3. Background jobs are running:
   ```bash
   journalctl -u documenso -f | grep "JOB"
   ```
4. Check error logs:
   ```bash
   journalctl -u documenso -n 100 | grep -i "error\|failed"
   ```

### Digital Signature Not Applied

**Check**:
1. User has an active certificate:
   ```sql
   SELECT * FROM "UserCertificate" WHERE "userId" = X AND status = 'ACTIVE';
   ```
2. OpenXPKI is enabled in `.env`: `NEXT_PRIVATE_OPENXPKI_ENABLED="true"`
3. Job executed successfully:
   ```bash
   journalctl -u documenso | grep "sign-with-user-certificate"
   ```
4. PDF is accessible from storage

### Signature Verification Fails in Adobe Reader

**Possible Causes**:
- Certificate not trusted (add OpenXPKI CA to trusted certificates)
- Certificate expired
- PDF was modified after signing
- Signature format issue

**Fix**:
1. Export OpenXPKI CA certificate
2. Import into Adobe Reader's trusted certificates
3. Verify signature again

### Certificate Shows as PENDING

**Meaning**: Certificate request was submitted but not yet approved/issued by OpenXPKI.

**Actions**:
1. Check OpenXPKI workflow status
2. Verify auto-approval is configured
3. Check OpenXPKI server logs
4. May require manual approval in OpenXPKI interface

## Monitoring Commands

### Watch Live Logs
```bash
journalctl -u documenso -f
```

### Filter for Certificate Activity
```bash
journalctl -u documenso -f | grep -i "certificate\|openxpki\|provision\|sign"
```

### Check Service Status
```bash
systemctl status documenso
```

### View Recent Errors
```bash
journalctl -u documenso --since "10 minutes ago" | grep -i error
```

## Performance Expectations

- **Certificate Provisioning**: 10-30 seconds
- **Digital Signature Application**: 5-10 seconds
- **PDF Size Increase**: ~5-10KB per signature
- **Certificate Validity**: 1 year (default)

## Success Criteria

✅ User signs document → certificate auto-provisioned  
✅ Recipient completes signing → digital signature applied  
✅ Multiple recipients → multiple signatures (all valid)  
✅ Certificates visible in UI  
✅ PDF signatures verifiable in Adobe Reader  
✅ No errors in application logs  

## Next Steps After Testing

1. **Configure Certificate Expiration Monitoring**
   - Set up cron job for `check-certificate-expiration`
   - Configure email notifications for expiring certificates

2. **Set Up Production OpenXPKI**
   - Use production-grade certificates
   - Configure proper CA hierarchy
   - Set up certificate revocation lists (CRL)

3. **Add Timestamp Authority (Optional)**
   - For long-term validation (LTV)
   - Provides proof of signing time

4. **Configure Certificate Policies**
   - Define certificate lifetimes
   - Set up renewal workflows
   - Configure revocation policies

5. **Enable Audit Logging**
   - Track all certificate operations
   - Log signature applications
   - Monitor for security events

## Support

If you encounter issues:
1. Check application logs
2. Verify OpenXPKI server status
3. Review database records
4. Test SCEP connectivity
5. Consult `OPENXPKI_INTEGRATION.md` for detailed documentation

---

**Ready to Test!** 🚀

Start by visiting https://demo.signdex.ai/settings/certificates and creating a test document.
