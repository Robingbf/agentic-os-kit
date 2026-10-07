#!/usr/bin/env bash
# Builds the desktop app of your OS (macOS): "<OS name>.app" in ~/Applications (or the folder given as argument).
# Name, accent colour and port come from os.config.json. Needs the Xcode Command Line Tools (xcode-select --install).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
[ "$(uname -s)" = "Darwin" ] || { echo "macOS only — on Linux run: bash tools/desktop-app/linux.sh"; exit 1; }
command -v swiftc >/dev/null || { echo "swiftc not found: run  xcode-select --install  then retry"; exit 1; }
read -r NAME ACCENT PORT SLUG < <(python3 - "$ROOT" <<'PY'
import re, sys
sys.path.insert(0, sys.argv[1] + "/routines")
import config
c = config.load()
name = (c.get("name") or "Agentic OS").replace("/", "-").strip() or "Agentic OS"
accent = (c.get("dashboard", {}).get("accent") or "#ff7a2f").lstrip("#")
accent = accent if re.fullmatch(r"[0-9a-fA-F]{6}", accent) else "ff7a2f"
port = str(c.get("dashboard", {}).get("port") or 8765)
slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "agentic-os"
print(name.replace(" ", " "), accent, port, slug)
PY
)
NAME="${NAME//$' '/ }"
DEST="${1:-$HOME/Applications}"
APP="$DEST/$NAME.app"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$DEST"

echo "→ compiling"
swiftc -O "$HERE/main.swift" -o "$TMP/OSApp" -framework Cocoa -framework WebKit
swiftc -O "$HERE/make_icon.swift" -o "$TMP/make_icon" -framework Cocoa

echo "→ icon (#$ACCENT)"
mkdir -p "$TMP/AppIcon.iconset"
for s in 16 32 128 256 512; do
  "$TMP/make_icon" "$s" "$TMP/AppIcon.iconset/icon_${s}x${s}.png" "$ACCENT"
  "$TMP/make_icon" "$((s * 2))" "$TMP/AppIcon.iconset/icon_${s}x${s}@2x.png" "$ACCENT"
done
iconutil -c icns "$TMP/AppIcon.iconset" -o "$TMP/AppIcon.icns"

echo "→ bundle $APP"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$TMP/OSApp" "$APP/Contents/MacOS/OSApp"
cp "$TMP/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>$NAME</string>
  <key>CFBundleDisplayName</key><string>$NAME</string>
  <key>CFBundleIdentifier</key><string>local.agentic-os.$SLUG</string>
  <key>CFBundleExecutable</key><string>OSApp</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSDocumentsFolderUsageDescription</key><string>Your OS reads and saves your project documents (preview, search, brain).</string>
  <key>NSDesktopFolderUsageDescription</key><string>Your OS reads and saves your project documents (preview, search, brain).</string>
  <key>NSDownloadsFolderUsageDescription</key><string>Your OS reads and saves your project documents (preview, search, brain).</string>
  <key>NSFileProviderDomainUsageDescription</key><string>Your OS reads and saves your project documents (preview, search, brain).</string>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
  <key>OSRoot</key><string>$ROOT</string>
  <key>OSPort</key><string>$PORT</string>
</dict></plist>
PLIST
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true
touch "$APP"
echo "✓ $APP — open it from Launchpad / Applications, then right-click its Dock icon → Options → Keep in Dock"
