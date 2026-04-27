#!/bin/bash
#
# Generate a release keystore for signing the Harmoniq APK.
#
# Usage:
#   ./scripts/generate-keystore.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
KEYSTORE_PATH="$APP_ROOT/android/app/harmoniq-release.keystore"

if ! command -v keytool >/dev/null 2>&1; then
  echo "Error: keytool is not installed or not in PATH."
  echo "Install a JDK and try again."
  exit 1
fi

if [ -f "$KEYSTORE_PATH" ]; then
  echo "Keystore already exists at $KEYSTORE_PATH"
  echo "Delete it first if you want to regenerate."
  exit 1
fi

echo "Generating release keystore at $KEYSTORE_PATH ..."
echo "You will be prompted for a store password and key password."
echo ""

keytool -genkeypair -v \
  -storetype JKS \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -alias harmoniq-key \
  -keystore "$KEYSTORE_PATH" \
  -dname "CN=Harmoniq, OU=Mobile, O=Harmoniq, L=Unknown, ST=Unknown, C=US"

echo ""
echo "Keystore generated at $KEYSTORE_PATH"
echo ""
echo "Recommended next step (more secure): add credentials to ~/.gradle/gradle.properties"
echo ""
echo "HARMONIQ_RELEASE_STORE_FILE=harmoniq-release.keystore"
echo "HARMONIQ_RELEASE_KEY_ALIAS=harmoniq-key"
echo "HARMONIQ_RELEASE_STORE_PASSWORD=<your-store-password>"
echo "HARMONIQ_RELEASE_KEY_PASSWORD=<your-key-password>"
echo ""
echo "Then run: npm run build:android:prod"
