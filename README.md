# thai-smartcard

High-performance Smart Card Reader library for Node.js - Native Rust bindings for PC/SC protocol. **Supports all smart card types** (Thai ID cards, EMV cards, contactless cards, etc.)

## Features

- 🚀 **High Performance** - Native Rust implementation
- 🔌 **Universal Support** - Works with all PC/SC compatible smart cards
- 📇 **Thai ID Cards** - Optimized for Thai national ID cards
- 💳 **EMV Cards** - Support for credit/debit cards
- 🔐 **Contactless Cards** - NFC/RFID card support
- 🎯 **TypeScript** - Full TypeScript support
- ⚡ **Auto Retry** - Built-in retry logic
- 🔄 **GET RESPONSE** - Automatic handling of extended data responses

## Prerequisites

- **Node.js** 14.0 or higher
- **PC/SC Smart Card Service**
  - macOS/Windows: Pre-installed
  - Linux: `sudo apt-get install pcscd libpcsclite1` (Ubuntu/Debian) or `sudo dnf install pcsc-lite pcsc-lite-libs` (Fedora/RHEL)
- **Card Reader** compatible with PC/SC protocol

## Installation

```bash
npm install thai-smartcard
# or: yarn add thai-smartcard
# or: bun add thai-smartcard
# or: pnpm add thai-smartcard
```

**Pre-built binaries included** - No Rust installation required. Supports macOS (Intel & Apple Silicon), Linux (x64 & ARM64), and Windows (x64 & ARM64).

## Quick Start

### Basic Usage

```typescript
import { SmartCardReader, ShareMode, Disposition } from 'thai-smartcard';

const reader = new SmartCardReader();

// List available readers
const readers = reader.listReaders();
console.log('Available readers:', readers);

// Connect to card
const card = reader.connect(readers[0], ShareMode.Shared);

// Transmit APDU command
const result = card.transmit(
  Buffer.from([0x00, 0xA4, 0x04, 0x00, 0x08, 0xA0, 0x00, 0x00, 0x00, 0x54, 0x48, 0x00, 0x01])
);

console.log('Response:', result.data.toString('hex'));
console.log('Status:', result.sw1.toString(16), result.sw2.toString(16));

// Disconnect
card.disconnect(Disposition.LeaveCard);
```

### Reading Thai ID Card

```typescript
import { SmartCardReader, ShareMode, Disposition } from 'thai-smartcard';

const reader = new SmartCardReader();
const readers = reader.listReaders();

if (readers.length === 0) {
  throw new Error('No card readers found');
}

// Wait for card
const status = await reader.waitForCard(readers[0], 30000);
if (!status.present) {
  throw new Error('No card present');
}

// Connect to card
const card = reader.connect(readers[0], ShareMode.Shared);

try {
  // SELECT Thai ID application
  const selectResult = card.transmit(
    Buffer.from([0x00, 0xA4, 0x04, 0x00, 0x08, 0xA0, 0x00, 0x00, 0x00, 0x54, 0x48, 0x00, 0x01]),
    40
  );

  if (selectResult.sw1 !== 0x90 || selectResult.sw2 !== 0x00) {
    throw new Error('Failed to select application');
  }

  // Read Citizen ID
  const cidResult = card.transmit(
    Buffer.from([0x80, 0xB0, 0x00, 0x04, 0x02, 0x00, 0x0D]),
    40
  );

  const citizenId = cidResult.data.slice(0, 13).toString('ascii');
  console.log('Citizen ID:', citizenId);

  // Read Thai Name
  const nameResult = card.transmit(
    Buffer.from([0x80, 0xB0, 0x00, 0x11, 0x02, 0x00, 0x64]),
    100
  );

  // Parse TIS-620 encoded Thai text
  const nameTh = parseThaiText(nameResult.data);
  console.log('Name (TH):', nameTh);

} finally {
  card.disconnect(Disposition.LeaveCard);
}
```

### With Retry Logic

```typescript
const result = card.transmitWithRetry(
  Buffer.from([0x00, 0xA4, 0x04, 0x00, 0x08, 0xA0, 0x00, 0x00, 0x00, 0x54, 0x48, 0x00, 0x01]),
  40,
  3,  // max retries
  100 // retry delay (ms)
);
```

## API Reference

### `SmartCardReader`

```typescript
new SmartCardReader()

// Methods
listReaders(): string[]
getStatus(readerName: string): CardStatus
connect(readerName: string, shareMode?: ShareMode, preferredProtocol?: Protocol): Card
waitForCard(readerName: string, timeoutMs?: number): Promise<CardStatus>
```

### `Card`

```typescript
// Methods
getATR(): Buffer | undefined
getStatus(): CardStatus
transmit(command: Buffer, responseLength?: number, maxGetResponse?: number): TransmitResult
transmitWithRetry(command: Buffer, responseLength?: number, maxRetries?: number, retryDelayMs?: number): TransmitResult
disconnect(disposition?: Disposition): void
```

### Types

```typescript
interface TransmitResult {
  data: Buffer;  // Response data (excluding status word)
  sw1: number;   // Status word byte 1
  sw2: number;   // Status word byte 2
}

interface CardStatus {
  present: boolean;  // Card is present in reader
  empty: boolean;    // Reader slot is empty
  mute: boolean;     // Card is mute (not responding)
  atr?: Buffer;      // ATR (Answer To Reset)
}

enum ShareMode {
  Shared = 0,      // Multiple applications can access
  Exclusive = 1,   // Only this application can access
  Direct = 2,      // Direct access to reader
}

enum Protocol {
  T0 = 0,    // T=0 protocol
  T1 = 1,    // T=1 protocol
  Raw = 2,   // Raw protocol
  Any = 3,   // Any protocol (auto-detect)
}

enum Disposition {
  LeaveCard = 0,    // Leave card in reader
  ResetCard = 1,    // Reset card
  UnpowerCard = 2,  // Unpower card
  EjectCard = 3,    // Eject card
}
```

## Error Handling & Best Practices

The library throws errors for common scenarios (reader not found, card not present, communication errors, timeouts). Always wrap calls in try-catch blocks:

```typescript
try {
  const card = reader.connect(readerName);
  const result = card.transmit(command);
} catch (error) {
  console.error('Error:', error.message);
}
```

**Performance Tips:**
- Reuse card connection for multiple APDU commands
- Set appropriate `responseLength` to avoid unnecessary data
- Use `transmitWithRetry` for unreliable cards
- Monitor card status with `waitForCard`

## Troubleshooting

**No readers found:**
- Ensure card reader is connected
- Check PC/SC service is running: `sudo systemctl status pcscd` (Linux)

**Permission errors (Linux):**
```bash
sudo usermod -a -G pcscd $USER
# Log out and log back in
```

## License

MIT
