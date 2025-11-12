import { existsSync } from 'fs';
import { join } from 'path';

let nativeBinding: any = null;

// Try to load the native binding
const loadBinding = (): any => {
  if (nativeBinding) {
    return nativeBinding;
  }

  const packageRoot = __dirname;
  const platform = process.platform;
  const arch = process.arch;
  
  // Detect if running on musl (Alpine Linux)
  // Check for Alpine-specific files or try to detect musl
  let isMusl = false;
  if (platform === 'linux') {
    try {
      // Check for Alpine release file (most reliable)
      if (existsSync('/etc/alpine-release')) {
        isMusl = true;
      } else {
        // Try to detect musl by checking if ldd exists and what it reports
        // musl-based systems typically don't have glibc
        const { execSync } = require('child_process');
        try {
          const lddOutput = execSync('ldd --version 2>&1', { encoding: 'utf-8', stdio: 'pipe' });
          // musl ldd reports "musl libc" while glibc reports "GNU libc"
          if (lddOutput.includes('musl')) {
            isMusl = true;
          }
        } catch {
          // If ldd fails, assume glibc (most common)
          isMusl = false;
        }
      }
    } catch {
      // If detection fails, default to gnu (most common)
      isMusl = false;
    }
  }
  
  // Determine platform-specific binary name
  let platformBinary: string;
  let platformBinaryAlt: string | null = null;
  if (platform === 'darwin') {
    platformBinary = arch === 'arm64' 
      ? 'thai-smartcard.darwin-arm64.node'
      : 'thai-smartcard.darwin-x64.node';
  } else if (platform === 'linux') {
    if (isMusl) {
      // Prefer musl binary for Alpine
      platformBinary = arch === 'arm64'
        ? 'thai-smartcard.linux-arm64-musl.node'
        : 'thai-smartcard.linux-x64-musl.node';
      // Also try gnu as fallback
      platformBinaryAlt = arch === 'arm64'
        ? 'thai-smartcard.linux-arm64-gnu.node'
        : 'thai-smartcard.linux-x64-gnu.node';
    } else {
      // Default to gnu for most Linux distributions
      platformBinary = arch === 'arm64'
        ? 'thai-smartcard.linux-arm64-gnu.node'
        : 'thai-smartcard.linux-x64-gnu.node';
      // Also try musl as fallback
      platformBinaryAlt = arch === 'arm64'
        ? 'thai-smartcard.linux-arm64-musl.node'
        : 'thai-smartcard.linux-x64-musl.node';
    }
  } else if (platform === 'win32') {
    platformBinary = arch === 'arm64'
      ? 'thai-smartcard.win32-arm64-msvc.node'
      : 'thai-smartcard.win32-x64-msvc.node';
  } else {
    platformBinary = '';
  }

  const bindings = [
    // Development build (highest priority)
    join(packageRoot, 'thai-smartcard.node'),
    join(packageRoot, 'index.node'),
    // Platform-specific production build (preferred libc)
    platformBinary ? join(packageRoot, platformBinary) : null,
    // Alternative libc binary (musl/gnu)
    platformBinaryAlt ? join(packageRoot, platformBinaryAlt) : null,
    // Fallback: try all platform binaries
    join(packageRoot, 'thai-smartcard.darwin-arm64.node'),
    join(packageRoot, 'thai-smartcard.darwin-x64.node'),
    join(packageRoot, 'thai-smartcard.linux-arm64-musl.node'),
    join(packageRoot, 'thai-smartcard.linux-x64-musl.node'),
    join(packageRoot, 'thai-smartcard.linux-arm64-gnu.node'),
    join(packageRoot, 'thai-smartcard.linux-x64-gnu.node'),
    join(packageRoot, 'thai-smartcard.win32-arm64-msvc.node'),
    join(packageRoot, 'thai-smartcard.win32-x64-msvc.node'),
  ].filter(Boolean) as string[];

  for (const binding of bindings) {
    if (existsSync(binding)) {
      try {
        nativeBinding = require(binding);
        return nativeBinding;
      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        
        // Check for PC/SC library missing error
        if (errorMessage.includes('libpcsclite') || errorMessage.includes('pcsclite')) {
          const muslNote = isMusl 
            ? `\n   NOTE: You are running on Alpine Linux (musl). Make sure you have the musl-compatible binary.\n`
            : '';
          const troubleshooting = platform === 'linux'
            ? `\n\nTROUBLESHOOTING:\n` +
              `1. Install PC/SC libraries:\n` +
              `   Ubuntu/Debian: sudo apt-get update && sudo apt-get install -y pcscd libpcsclite1\n` +
              `   Alpine: apk add --no-cache pcsc-lite\n` +
              `   Fedora/RHEL: sudo dnf install -y pcsc-lite pcsc-lite-libs\n${muslNote}\n` +
              `2. Verify library is installed:\n` +
              `   Run: ldconfig -p | grep pcsclite || ls -la /lib/libpcsclite.so* || ls -la /usr/lib/libpcsclite.so*\n\n` +
              `3. For Docker (Alpine):\n` +
              `   - Make sure pcsc-lite is installed: RUN apk add --no-cache pcsc-lite\n` +
              `   - Verify the musl binary exists: ls -la node_modules/thai-smartcard/thai-smartcard.linux-x64-musl.node\n` +
              `   - If musl binary is missing, the package may need to be rebuilt with musl support\n\n` +
              `4. For Docker (Debian/Ubuntu):\n` +
              `   - Make sure libpcsclite1 is installed: RUN apt-get update && apt-get install -y libpcsclite1\n` +
              `   - If using multi-stage build, ensure runtime dependencies are copied to final stage\n\n` +
              `5. Check library path:\n` +
              `   Alpine: LD_LIBRARY_PATH=/lib:/usr/lib node your-app.js\n` +
              `   Debian/Ubuntu: LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu:/lib:/usr/lib node your-app.js\n`
            : '';
          
          throw new Error(
            `Failed to load native binding: ${errorMessage}${troubleshooting}`
          );
        }
        
        // Check for binary compatibility errors (musl vs gnu)
        if (errorMessage.includes('No such file') && platform === 'linux' && binding.includes('.node')) {
          const muslHint = isMusl
            ? `\n\nNOTE: You are on Alpine Linux (musl). The package needs the musl-compatible binary.\n` +
              `Expected: thai-smartcard.linux-x64-musl.node or thai-smartcard.linux-arm64-musl.node\n` +
              `If missing, the package may need to be rebuilt or you may need to use a Debian/Ubuntu base image.\n`
            : '';
          if (muslHint) {
            throw new Error(
              `Failed to load native binding: ${errorMessage}${muslHint}`
            );
          }
        }
        
        // Re-throw other errors as-is
        throw error;
      }
    }
  }

  const muslInfo = platform === 'linux' && isMusl
    ? `\n\nNOTE: You are running on Alpine Linux (musl). The package needs musl-compatible binaries.\n` +
      `Expected binary: thai-smartcard.linux-${arch === 'arm64' ? 'arm64' : 'x64'}-musl.node\n` +
      `If the musl binary is missing, you may need to:\n` +
      `1. Rebuild the package with musl support, or\n` +
      `2. Use a Debian/Ubuntu base image instead of Alpine\n`
    : '';
  
  throw new Error(
    `Cannot find native binding for thai-smartcard on ${platform}-${arch}. Tried: ${bindings.join(', ')}${muslInfo}`
  );
};

const binding = loadBinding();

/**
 * APDU Transmit Result
 */
export interface TransmitResult {
  /** Response data (excluding status word) */
  data: Buffer;
  /** Status word byte 1 */
  sw1: number;
  /** Status word byte 2 */
  sw2: number;
}

/**
 * Card Status Information
 */
export interface CardStatus {
  /** Card is present in reader */
  present: boolean;
  /** Reader slot is empty */
  empty: boolean;
  /** Card is mute (not responding) */
  mute: boolean;
  /** ATR (Answer To Reset) - identifies card type */
  atr?: Buffer;
}

/**
 * Share Mode for card connection
 */
export enum ShareMode {
  /** Shared mode - multiple applications can access the card */
  Shared = 0,
  /** Exclusive mode - only this application can access the card */
  Exclusive = 1,
  /** Direct mode - direct access to reader */
  Direct = 2,
}

/**
 * Preferred Protocol for card connection
 */
export enum Protocol {
  /** T=0 protocol */
  T0 = 0,
  /** T=1 protocol */
  T1 = 1,
  /** Raw protocol */
  Raw = 2,
  /** Any protocol (auto-detect) */
  Any = 3,
}

/**
 * Disposition when disconnecting card
 */
export enum Disposition {
  /** Leave card in reader */
  LeaveCard = 0,
  /** Reset card */
  ResetCard = 1,
  /** Unpower card */
  UnpowerCard = 2,
  /** Eject card */
  EjectCard = 3,
}

/**
 * Smart Card Reader
 * 
 * High-performance PC/SC smart card reader interface
 * Supports all types of smart cards (not just Thai ID cards)
 * 
 * @example
 * ```typescript
 * import { SmartCardReader, ShareMode } from 'thai-smartcard';
 * 
 * const reader = new SmartCardReader();
 * const readers = reader.listReaders();
 * const card = reader.connect(readers[0], ShareMode.Shared);
 * const result = card.transmit(Buffer.from([0x00, 0xA4, 0x04, 0x00, 0x08, 0xA0, 0x00, 0x00, 0x00, 0x54, 0x48, 0x00, 0x01]));
 * console.log('Response:', result.data.toString('hex'));
 * card.disconnect(Disposition.LeaveCard);
 * ```
 */
export class SmartCardReader {
  private native: any;

  constructor() {
    this.native = new binding.SmartCardReader();
  }

  /**
   * List all available card readers
   * @returns Array of reader names
   */
  listReaders(): string[] {
    return this.native.listReaders();
  }

  /**
   * Get card status for a specific reader
   * @param readerName Reader name
   * @returns Card status information
   */
  getStatus(readerName: string): CardStatus {
    return this.native.getStatus(readerName);
  }

  /**
   * Connect to a card in the specified reader
   * @param readerName Reader name
   * @param shareMode Share mode (default: Shared)
   * @param preferredProtocol Preferred protocol (default: Any - auto-detect)
   * @returns Connected card instance
   */
  connect(
    readerName: string,
    shareMode: ShareMode = ShareMode.Shared,
    preferredProtocol?: Protocol
  ): Card {
    const protocol = preferredProtocol !== undefined ? preferredProtocol : 3; // Any
    return new Card(this.native.connect(readerName, shareMode, protocol));
  }

  /**
   * Wait for card status change
   * @param readerName Reader name
   * @param timeoutMs Timeout in milliseconds (default: 30000)
   * @returns Card status when change detected
   */
  async waitForCard(readerName: string, timeoutMs: number = 30000): Promise<CardStatus> {
    return await this.native.waitForCard(readerName, timeoutMs);
  }
}

/**
 * Smart Card Connection
 * 
 * Represents an active connection to a smart card
 */
export class Card {
  private native: any;

  constructor(native: any) {
    this.native = native;
  }

  /**
   * Get ATR (Answer To Reset) - identifies card type
   * @returns ATR buffer or undefined if not available
   */
  getATR(): Buffer | undefined {
    return this.native.getAtr();
  }

  /**
   * Get current card status
   * @returns Card status information
   */
  getStatus(): CardStatus {
    return this.native.getStatus();
  }

  /**
   * Transmit APDU command to card
   * Automatically handles GET RESPONSE for extended data
   * 
   * @param command APDU command buffer
   * @param responseLength Expected response length (default: 40)
   * @param maxGetResponse Maximum GET RESPONSE iterations (default: 3)
   * @returns Transmit result with data and status word
   */
  transmit(
    command: Buffer,
    responseLength: number = 40,
    maxGetResponse?: number
  ): TransmitResult {
    return this.native.transmit(command, responseLength, maxGetResponse);
  }

  /**
   * Transmit APDU command with automatic retry logic
   * 
   * @param command APDU command buffer
   * @param responseLength Expected response length (default: 40)
   * @param maxRetries Maximum retry attempts (default: 3)
   * @param retryDelayMs Delay between retries in milliseconds (default: 100)
   * @returns Transmit result with data and status word
   */
  transmitWithRetry(
    command: Buffer,
    responseLength: number = 40,
    maxRetries?: number,
    retryDelayMs?: number
  ): TransmitResult {
    return this.native.transmitWithRetry(command, responseLength, maxRetries, retryDelayMs);
  }

  /**
   * Disconnect from card
   * @param disposition Disposition mode (default: LeaveCard)
   */
  disconnect(disposition: Disposition = Disposition.LeaveCard): void {
    this.native.disconnect(disposition);
  }
}

/**
 * Get library version
 * @returns Version string
 */
export function getVersion(): string {
  return binding.getVersion();
}
