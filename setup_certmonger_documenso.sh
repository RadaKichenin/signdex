#!/bin/bash

# --- CONFIGURATION VARIABLES ---
# OpenXPKI Settings
SCEP_URL="http://127.0.0.1:8080/scep/generic" # Adjust IP/Port if needed
CA_NAME="openxpki-scep"
CHALLENGE_PASSWORD="SecretChallenge"
CERT_SUBJECT="CN=Documenso Signer,O=My Company"

# File Paths (Where Certmonger will store raw files)
CERT_DIR="/etc/pki/documenso"
KEY_FILE="$CERT_DIR/documenso.key"
CERT_FILE="$CERT_DIR/documenso.crt"

# Final Output (Where Documenso reads the .p12)
P12_FILE="/opt/documenso/certs/documenso.p12"
P12_PASS="DocumensoDemo123" # Must match NEXT_PRIVATE_SIGNING_PASSPHRASE

# --- SCRIPT START ---

#echo ">>> Installing Certmonger..."
#dnf install -y certmonger
#systemctl enable --now certmonger

echo ">>> Creating directory structure..."
mkdir -p "$CERT_DIR"
mkdir -p "$(dirname "$P12_FILE")"
# Set permissions so certmonger can write
chmod 700 "$CERT_DIR"

# --- 1. DEFINE THE POST-SAVE HOOK ---
# This script runs every time Certmonger gets a new cert or renews one.
HOOK_SCRIPT="/usr/local/bin/documenso-bundle-hook.sh"

echo ">>> Creating Post-Save Hook at $HOOK_SCRIPT..."
cat <<EOF > "$HOOK_SCRIPT"
#!/bin/bash
# This script is triggered by Certmonger after a successful enrollment/renewal.

# Variables passed by Certmonger environment or defined globally
KEY_PATH="$KEY_FILE"
CERT_PATH="$CERT_FILE"
FINAL_P12="$P12_FILE"
PASS="$P12_PASS"

echo "Generating .p12 bundle for Documenso..."

# Bundle the private key and certificate
# Note: In a real prod environment, you might also include -certfile for the CA chain
openssl pkcs12 -export \\
    -in "\$CERT_PATH" \\
    -inkey "\$KEY_PATH" \\
    -out "\$FINAL_P12" \\
    -passout "pass:\$PASS"

# Set permissions for Documenso (User 1001 is standard for Documenso Docker)
chmod 644 "\$FINAL_P12"
# chown 1001:1001 "\$FINAL_P12" # Uncomment if needed for Docker user

# Restart Documenso to pick up the new file
# (Adjust this command based on how you run Documenso)
#docker compose -f /path/to/your/docker-compose.yml restart documenso
systemctl restart documenso

EOF

chmod +x "$HOOK_SCRIPT"

# --- 2. CONFIGURE CERTMONGER ---

echo ">>> Adding OpenXPKI CA to Certmonger..."
# We remove it first in case you are re-running the script
getcert remove-ca -c "$CA_NAME" 2>/dev/null || true

getcert add-scep-ca \
    -c "$CA_NAME" \
    -u "$SCEP_URL"

echo ">>> Requesting Certificate..."
# Request a fresh certificate
# -c: CA Name we just added
# -k: Private Key Location
# -f: Certificate Location
# -N: Subject Name (CN)
# -L: Challenge Password (for SCEP auth)
# -C: Command to run after saving (The Hook)
getcert request \
    -c "$CA_NAME" \
    -k "$KEY_FILE" \
    -f "$CERT_FILE" \
    -N "$CERT_SUBJECT" \
    -L "$CHALLENGE_PASSWORD" \
    -C "$HOOK_SCRIPT" \
    -w # Wait for the request to complete

echo ">>> Done! Check status below:"
getcert list -f "$CERT_FILE"
