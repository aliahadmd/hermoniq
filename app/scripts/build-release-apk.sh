#!/bin/bash
#
# Build a signed release APK for Harmoniq with automatic version bumping.
#
# Usage:
#   ./scripts/build-release-apk.sh
#
# Optional:
#   SKIP_VERSION_BUMP=1 ./scripts/build-release-apk.sh
#   SKIP_NATIVE_SYNC=1 ./scripts/build-release-apk.sh
#   SKIP_GRADLE_CLEAN=1 ./scripts/build-release-apk.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ANDROID_DIR="$APP_ROOT/android"
LOCAL_GRADLE_PROPERTIES="$ANDROID_DIR/gradle.properties"
GLOBAL_GRADLE_PROPERTIES="$HOME/.gradle/gradle.properties"
APK_OUTPUT="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
RELEASE_DIR="$APP_ROOT/release"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: Required command '$1' is not available."
    exit 1
  fi
}

find_apksigner() {
  if command -v apksigner >/dev/null 2>&1; then
    command -v apksigner
    return 0
  fi

  local candidate
  candidate="$(ls -1d \
    "${ANDROID_HOME:-}"/build-tools/*/apksigner \
    "${ANDROID_SDK_ROOT:-}"/build-tools/*/apksigner \
    "$HOME"/Library/Android/sdk/build-tools/*/apksigner \
    2>/dev/null | sort -V | tail -n 1 || true)"

  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    echo "$candidate"
    return 0
  fi

  return 1
}

get_property() {
  local key="$1"
  local file="$2"

  if [ ! -f "$file" ]; then
    return 1
  fi

  local value
  value="$(grep -E "^${key}=" "$file" | tail -n 1 | cut -d '=' -f2- | tr -d '\r')"

  if [ -n "$value" ]; then
    echo "$value"
    return 0
  fi

  return 1
}

get_signing_property() {
  local key="$1"

  local value
  if value="$(get_property "$key" "$LOCAL_GRADLE_PROPERTIES")"; then
    echo "$value"
    return 0
  fi

  if value="$(get_property "$key" "$GLOBAL_GRADLE_PROPERTIES")"; then
    echo "$value"
    return 0
  fi

  return 1
}

resolve_keystore_path() {
  local store_file_value="$1"

  if [[ "$store_file_value" = /* ]]; then
    echo "$store_file_value"
  else
    echo "$ANDROID_DIR/app/$store_file_value"
  fi
}

print_version_info() {
  local version_name
  version_name="$(node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));console.log(p.version);' "$APP_ROOT/package.json")"

  local version_code
  version_code="$(node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));console.log(p.expo?.android?.versionCode ?? "unknown");' "$APP_ROOT/app.json")"

  echo "App version: $version_name"
  echo "Android versionCode: $version_code"
}

require_command node
require_command npx

if [ ! -f "$LOCAL_GRADLE_PROPERTIES" ]; then
  echo "Error: Missing $LOCAL_GRADLE_PROPERTIES"
  exit 1
fi

store_file="$(get_signing_property "HARMONIQ_RELEASE_STORE_FILE" || true)"
key_alias="$(get_signing_property "HARMONIQ_RELEASE_KEY_ALIAS" || true)"
store_password="$(get_signing_property "HARMONIQ_RELEASE_STORE_PASSWORD" || true)"
key_password="$(get_signing_property "HARMONIQ_RELEASE_KEY_PASSWORD" || true)"

if [ -z "$store_file" ] || [ -z "$key_alias" ] || [ -z "$store_password" ] || [ -z "$key_password" ]; then
  echo "Error: Missing required signing properties."
  echo "Set these keys in either:"
  echo "  - $LOCAL_GRADLE_PROPERTIES"
  echo "  - $GLOBAL_GRADLE_PROPERTIES"
  echo "Keys required:"
  echo "  HARMONIQ_RELEASE_STORE_FILE"
  echo "  HARMONIQ_RELEASE_KEY_ALIAS"
  echo "  HARMONIQ_RELEASE_STORE_PASSWORD"
  echo "  HARMONIQ_RELEASE_KEY_PASSWORD"
  exit 1
fi

keystore_path="$(resolve_keystore_path "$store_file")"
if [ ! -f "$keystore_path" ]; then
  echo "Error: Release keystore not found at $keystore_path"
  echo "Run ./scripts/generate-keystore.sh first (or fix HARMONIQ_RELEASE_STORE_FILE)."
  exit 1
fi

if [ "$store_password" = "18141814" ] || [ "$key_password" = "18141814" ]; then
  echo "Warning: Signing password appears to be a default placeholder."
  echo "Use a strong unique password before distributing publicly."
fi

if [ "${SKIP_VERSION_BUMP:-0}" = "1" ]; then
  echo "Skipping version bump because SKIP_VERSION_BUMP=1"
else
  echo "Bumping app version and Android versionCode..."
  node "$APP_ROOT/scripts/bump-android-version.js"
fi

print_version_info

if [ "${SKIP_NATIVE_SYNC:-0}" = "1" ]; then
  echo "Skipping Expo native sync because SKIP_NATIVE_SYNC=1"
else
  echo "Syncing native Android resources from app config..."
  (
    cd "$APP_ROOT"
    export CI=1
    export NODE_ENV="${NODE_ENV:-production}"
    npx expo prebuild --platform android --no-install
  )
fi

echo "Building signed release APK..."
(
  cd "$ANDROID_DIR"
  export NODE_ENV="${NODE_ENV:-production}"

  if [ "${SKIP_GRADLE_CLEAN:-0}" = "1" ]; then
    echo "Skipping Gradle clean because SKIP_GRADLE_CLEAN=1"
  else
    echo "Cleaning Android build artifacts..."
    # Some RN native modules can fail in app:externalNativeBuildCleanDebug when
    # generated codegen JNI directories are already removed. Excluding those
    # clean tasks keeps the build deterministic without tripping this Gradle bug.
    ./gradlew clean -x app:externalNativeBuildCleanDebug -x app:externalNativeBuildCleanRelease
  fi

  # Remove any previous release output so this run always produces a fresh artifact.
  rm -f "$APK_OUTPUT"

  echo "Running release build with fresh task execution..."
  ./gradlew --no-build-cache app:assembleRelease --rerun-tasks
)

if [ ! -f "$APK_OUTPUT" ]; then
  echo "Error: Build completed but APK not found at expected path."
  echo "Expected: $APK_OUTPUT"
  exit 1
fi

mkdir -p "$RELEASE_DIR"

version_name="$(node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));console.log(p.version);' "$APP_ROOT/package.json")"
version_code="$(node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));console.log(p.expo?.android?.versionCode ?? "unknown");' "$APP_ROOT/app.json")"

versioned_apk="$RELEASE_DIR/harmoniq-v${version_name}-${version_code}.apk"
cp "$APK_OUTPUT" "$versioned_apk"

echo ""
echo "Release APK built successfully:"
echo "  $APK_OUTPUT"
echo "Versioned copy:"
echo "  $versioned_apk"

apksigner_path="$(find_apksigner || true)"
if [ -n "$apksigner_path" ]; then
  echo ""
  echo "APK signature verification:"
  "$apksigner_path" verify --print-certs "$versioned_apk"
else
  echo ""
  echo "Note: apksigner not found in PATH or standard Android SDK locations; skipped APK signature verification output."
fi
