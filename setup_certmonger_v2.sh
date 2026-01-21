#!/bin/bash

# --- CONFIGURATION ---
# The URL you confirmed works:
SCEP_URL="http://127.0.0.1:8080/scep/generic" 

# The Password found in Step 1 (Default for demo is usually SecretChallenge)
# If this is wrong, the request will hang in "CA_UNREACHABLE" or "PENDING"
CHALLENGE_PASSWORD="SecretChallenge"

# Certmonger local alias (can be anything)
CA_ALIAS="openxpki-democa"

# Certificate Details
CERT_SUBJECT="CN=Signdex Signer,O=Signdex SDN BHD"
# The OpenXPKI Profile to use (crucial for auto-approval policies)
# "tls_client" or "user" are standard profiles in the demo.
#CERT_PROFILE="tls_client" 
CERT_PROFILE="user" 

# Paths
CERT_DIR="/etc/pki/documenso"
KEY_FILE="$CERT_DIR/documenso.key"
CERT_FILE="$CERT_DIR/documenso.crt"

# Final Documenso Integration
P12_FILE="/opt/documenso/certs/documenso.p12"
P12_PASS="DocumensoDemo123" # Must match your .env file
HOOK_SCRIPT="/usr/local/bin/documenso-bundle-hook.sh"

# --- INSTALLATION & SETUP ---

# 1. Install Certmonger if missing
if ! rpm -q certmonger > /dev/null; then
    echo ">>> Installing Certmonger..."
    dnf install -y certmonger
    systemctl enable --now certmonger
fi

# 2. Prepare Directories
mkdir -p "$CERT_DIR"
mkdir -p "$(dirname "$P12_FILE")"
chmod 700 "$CERT_DIR"

# 3. Create the Hook Script (Bundles .p12 and restarts Documenso)
echo ">>> Creating Post-Save Hook..."
cat <<EOF > "$HOOK_SCRIPT"
#!/bin/bash
KEY="$KEY_FILE"
CRT="$CERT_FILE"
P12="$P12_FILE"
PASS="$P12_PASS"

echo "Running Documenso Bundle Hook..."

# Bundle PEM + Key into PKCS#12
openssl pkcs12 -export \\
    -in "\$CRT" \\
    -inkey "\$KEY" \\
    -out "\$P12" \\
    -passout "pass:\$PASS" \\
    -name "Documenso Key"

# Fix Permissions (Documenso in Docker usually needs UID 1001)
chmod 644 "\$P12"
# chown 1001:1001 "\$P12" 

# Restart Documenso container to load new cert
# Adjust the path to your docker-compose.yml file if not in the current dir
# Or use 'docker restart' if the container name is fixed
#docker restart documenso-documenso-1 || docker restart documenso
systemctl restart documenso

EOF
chmod +x "$HOOK_SCRIPT"

# --- CERTMONGER CONFIGURATION ---

# 4. Clean up previous definitions (to avoid conflicts)
getcert stop-tracking -f "$CERT_FILE" 2>/dev/null || true
getcert remove-ca -c "$CA_ALIAS" 2>/dev/null || true

# 5. Add the SCEP CA to Certmonger
echo ">>> Adding CA to Certmonger..."
getcert add-scep-ca \
    -c "$CA_ALIAS" \
    -u "$SCEP_URL"

# 6. Request the Certificate
echo ">>> Requesting Certificate..."
# -c: CA Alias
# -k: Private Key path
# -f: Cert path
# -N: Subject (CN)
# -L: Challenge Password (Auto-approves the request)
# -D: Subject Alternative Name (Optional, good practice)
# -C: The Hook Script to run after success
# -T: The Profile (OpenXPKI specific, often mapped to 'template_name' or passed as a generic attribute)
getcert request \
    -c "$CA_ALIAS" \
    -k "$KEY_FILE" \
    -f "$CERT_FILE" \
    -N "$CERT_SUBJECT" \
    -L "$CHALLENGE_PASSWORD" \
    -C "$HOOK_SCRIPT" \
    -w # Wait for completion

# --- STATUS CHECK ---
echo "--------------------------------"
echo "Request Status:"
getcert list -f "$CERT_FILE"
echo "--------------------------------"
echo "If status is MONITORING, check $P12_FILE"
