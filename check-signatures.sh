#!/bin/bash
# Quick script to check digital signatures

echo "=== Active Certificates ==="
PGPASSWORD='Documenso321' psql -h 127.0.0.1 -U documenso -d documenso -c \
"SELECT u.email, uc.status, uc.\"commonName\", uc.\"issuedAt\"::date 
FROM \"UserCertificate\" uc 
JOIN \"User\" u ON u.id = uc.\"userId\" 
WHERE uc.status = 'ACTIVE' 
ORDER BY uc.\"createdAt\" DESC;"

echo ""
echo "=== Recent Digital Signatures ==="
PGPASSWORD='Documenso321' psql -h 127.0.0.1 -U documenso -d documenso -c \
"SELECT 
  ds.\"signatureIndex\",
  e.title as document,
  r.email as signer,
  ds.\"signedAt\"::timestamp(0)
FROM \"DigitalSignature\" ds
JOIN \"Envelope\" e ON e.id = ds.\"envelopeId\"
JOIN \"Recipient\" r ON r.id = ds.\"recipientId\"
ORDER BY ds.\"signedAt\" DESC
LIMIT 10;"

echo ""
echo "=== Signature Count Per Document ==="
PGPASSWORD='Documenso321' psql -h 127.0.0.1 -U documenso -d documenso -c \
"SELECT 
  e.title,
  e.status,
  COUNT(ds.id) as signature_count
FROM \"Envelope\" e
LEFT JOIN \"DigitalSignature\" ds ON ds.\"envelopeId\" = e.id
GROUP BY e.id
HAVING COUNT(ds.id) > 0
ORDER BY e.\"updatedAt\" DESC
LIMIT 10;"
