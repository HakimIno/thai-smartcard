import { existsSync } from 'fs';
import { join } from 'path';

let nativeBinding: any = null;

// Try to load the native binding
const loadBinding = (): any => {
  if (nativeBinding) {
    return nativeBinding;
  }

  const packageRoot = __dirname;
  const bindings = [
    // Development build
    join(packageRoot, 'thai-smartcard.node'),
    join(packageRoot, 'index.node'),
    // Production build (platform-specific)
    join(packageRoot, 'thai-smartcard.darwin-arm64.node'),
    join(packageRoot, 'index.darwin-arm64.node'),
    join(packageRoot, 'thai-smartcard.darwin-x64.node'),
    join(packageRoot, 'index.darwin-x64.node'),
    join(packageRoot, 'thai-smartcard.linux-arm64-gnu.node'),
    join(packageRoot, 'thai-smartcard.linux-arm64-musl.node'),
    join(packageRoot, 'thai-smartcard.linux-x64-gnu.node'),
    join(packageRoot, 'thai-smartcard.linux-x64-musl.node'),
    join(packageRoot, 'thai-smartcard.win32-arm64-msvc.node'),
    join(packageRoot, 'thai-smartcard.win32-x64-msvc.node'),
    join(packageRoot, 'index.linux-arm64-gnu.node'),
    join(packageRoot, 'index.linux-arm64-musl.node'),
    join(packageRoot, 'index.linux-x64-gnu.node'),
    join(packageRoot, 'index.linux-x64-musl.node'),
    join(packageRoot, 'index.win32-arm64-msvc.node'),
    join(packageRoot, 'index.win32-x64-msvc.node'),
  ];

  for (const binding of bindings) {
    if (existsSync(binding)) {
      nativeBinding = require(binding);
      return nativeBinding;
    }
  }

  throw new Error(
    `Cannot find native binding for thai-smartcard. Tried: ${bindings.join(', ')}`
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
