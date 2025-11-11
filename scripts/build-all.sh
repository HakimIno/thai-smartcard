#!/bin/bash
# Build for all platforms
# This script builds native bindings for all supported platforms

set -e

echo "Building for all platforms..."

# Build for each target
TARGETS=(
  "x86_64-apple-darwin"
  "aarch64-apple-darwin"
  "x86_64-pc-windows-msvc"
  "aarch64-pc-windows-msvc"
  "x86_64-unknown-linux-gnu"
  "aarch64-unknown-linux-gnu"
  "x86_64-unknown-linux-musl"
  "aarch64-unknown-linux-musl"
)

for target in "${TARGETS[@]}"; do
  echo "Building for $target..."
  npx napi build --platform --target "$target" --release || echo "Failed to build for $target (may need cross-compilation setup)"
done

# Build TypeScript
echo "Compiling TypeScript..."
npx tsc index.ts --outDir . --module commonjs --target es2020 --esModuleInterop --skipLibCheck --declaration

echo "Build complete! Check for .node files:"
ls -lh thai-smartcard*.node 2>/dev/null || echo "No .node files found"

