# thai-smartcard

High-performance Smart Card Reader library for Node.js - Native Rust bindings for PC/SC protocol. **Supports all smart card types** (Thai ID cards, EMV cards, contactless cards, etc.)

## Features

- 🚀 **High Performance** - Native Rust implementation for maximum speed
- 🔌 **Universal Support** - Works with all PC/SC compatible smart cards
- 📇 **Thai ID Cards** - Optimized for Thai national ID cards
- 💳 **EMV Cards** - Support for credit/debit cards
- 🔐 **Contactless Cards** - NFC/RFID card support
- 🎯 **TypeScript** - Full TypeScript support with type definitions
- 🔧 **Flexible API** - Low-level APDU commands with high-level helpers
- ⚡ **Auto Retry** - Built-in retry logic for reliable communication
- 🔄 **GET RESPONSE** - Automatic handling of extended data responses

## Prerequisites

### System Requirements

1. **Node.js** (14.0 or higher)
2. **PC/SC Smart Card Service**
   - **macOS**: Pre-installed
   - **Linux**: Install `pcscd` service
     ```bash
     # Ubuntu/Debian
     sudo apt-get install pcscd libpcsclite1
     
     # Fedora/RHEL
     sudo dnf install pcsc-lite pcsc-lite-libs
     ```
   - **Windows**: Pre-installed
3. **Card Reader** compatible with PC/SC protocol

## Installation

```bash
# Using npm
npm install thai-smartcard

# Using yarn
yarn add thai-smartcard

# Using bun
bun add thai-smartcard

# Using pnpm
pnpm add thai-smartcard
```

**ไม่ต้องติดตั้ง Rust!** Package นี้มี **pre-built binaries** สำหรับทุก platform อยู่แล้ว เมื่อคุณ `npm install` จะได้ไฟล์ `.node` ที่ build ไว้แล้วทันที **ไม่ต้อง build เอง**

> **💡 วิธีทำงาน:** Build ครั้งเดียวสำหรับทุก platform (ใช้ GitHub Actions) → เก็บ binaries ทั้งหมดไว้ใน package → User install แล้วได้ binary ที่ถูกต้องสำหรับ platform ของเขาโดยอัตโนมัติ

### Pre-built Binaries

Package นี้ใช้ **pre-built binaries** ที่ build ล่วงหน้าแล้วสำหรับทุก platform:
- ✅ macOS (Intel & Apple Silicon)
- ✅ Linux (x64 & ARM64, GNU & musl)
- ✅ Windows (x64 & ARM64)

เมื่อคุณ `npm install thai-smartcard`:
- จะได้ pre-built binary สำหรับ platform ของคุณทันที
- **ไม่ต้อง build** - ไม่ต้องติดตั้ง Rust
- **ไม่ต้อง compile** - ทำงานได้ทันที

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
import { SmartCardReader, ShareMode, Disposition } from 'thai-smartcard';

const reader = new SmartCardReader();
const card = reader.connect('ACS ACR122U PICC Reader 0', ShareMode.Shared);

// Transmit with automatic retry (3 retries, 100ms delay)
const result = card.transmitWithRetry(
  Buffer.from([0x00, 0xA4, 0x04, 0x00, 0x08, 0xA0, 0x00, 0x00, 0x00, 0x54, 0x48, 0x00, 0x01]),
  40,
  3,  // max retries
  100 // retry delay (ms)
);

card.disconnect(Disposition.LeaveCard);
```

## Local Development Usage

### Using as Local Package

ใน `package.json` ของโปรเจกต์หลัก:

```json
{
  "dependencies": {
    "thai-smartcard": "file:./packages/thai-smartcard"
  }
}
```

จากนั้นรัน:
```bash
npm install
# หรือ
bun install
```

**ข้อดี:**
- ✅ ไม่ต้อง publish ไป npm
- ✅ ใช้ไฟล์ `.node` ที่ build ไว้แล้ว
- ✅ แก้ไข code ได้ทันที
- ✅ ไม่ต้องติดตั้ง Rust

## Building

### Development Build

```bash
npm run build
# หรือ
npm run build:dev
```

จะ build สำหรับ platform ปัจจุบันเท่านั้น

### Production Build (All Platforms)

```bash
npm run build:all
```

**สำคัญ:** ต้อง build สำหรับทุก platform ก่อน publish เพื่อให้ผู้ใช้ได้ pre-built binaries

### Build for Specific Platform

```bash
# Linux (GNU)
npx napi build --platform --target x86_64-unknown-linux-gnu --release

# Linux (musl - for Alpine Linux)
npx napi build --platform --target x86_64-unknown-linux-musl --release

# macOS (Intel)
npx napi build --platform --target x86_64-apple-darwin --release

# macOS (Apple Silicon)
npx napi build --platform --target aarch64-apple-darwin --release

# Windows (x64)
npx napi build --platform --target x86_64-pc-windows-msvc --release
```

**หมายเหตุ:** 
- Binary ที่ build บน macOS (`darwin-x64.node`) **ใช้ได้เฉพาะบน macOS เท่านั้น**
- สำหรับ Linux ต้อง build บน Linux machine หรือใช้ cross-compilation
- แต่ละ platform ต้องการ binary ที่ compile สำหรับ platform นั้นๆ

### Automated Build with GitHub Actions

Package นี้มี GitHub Actions workflow ที่ build สำหรับทุก platform อัตโนมัติ:

1. **เมื่อ push ไป main/develop** → Build สำหรับทุก platform
2. **เมื่อสร้าง tag v*.** → Build และ commit binaries กลับไป repo
3. **User install** → ได้ binary ที่ถูกต้องสำหรับ platform ของเขาโดยอัตโนมัติ

**วิธีใช้งาน:**
- เพียงแค่ push code → GitHub Actions จะ build ให้อัตโนมัติ
- ไม่ต้อง build เองทุก platform
- User install แล้วได้ binary ที่ถูกต้องทันที

## API Reference

### `SmartCardReader`

#### Constructor

```typescript
new SmartCardReader()
```

#### Methods

##### `listReaders(): string[]`

List all available card readers.

**Returns:** Array of reader names

##### `getStatus(readerName: string): CardStatus`

Get card status for a specific reader.

**Parameters:**
- `readerName: string` - Reader name

**Returns:** `CardStatus` object

##### `connect(readerName: string, shareMode?: ShareMode, preferredProtocol?: Protocol): Card`

Connect to a card in the specified reader.

**Parameters:**
- `readerName: string` - Reader name
- `shareMode?: ShareMode` - Share mode (default: `ShareMode.Shared`)
- `preferredProtocol?: Protocol` - Preferred protocol (default: `Protocol.Any`)

**Returns:** `Card` instance

##### `waitForCard(readerName: string, timeoutMs?: number): Promise<CardStatus>`

Wait for card status change.

**Parameters:**
- `readerName: string` - Reader name
- `timeoutMs?: number` - Timeout in milliseconds (default: 30000)

**Returns:** Promise resolving to `CardStatus`

### `Card`

#### Methods

##### `getATR(): Buffer | undefined`

Get ATR (Answer To Reset) - identifies card type.

**Returns:** ATR buffer or undefined

##### `getStatus(): CardStatus`

Get current card status.

**Returns:** `CardStatus` object

##### `transmit(command: Buffer, responseLength?: number, maxGetResponse?: number): TransmitResult`

Transmit APDU command to card. Automatically handles GET RESPONSE for extended data.

**Parameters:**
- `command: Buffer` - APDU command buffer
- `responseLength?: number` - Expected response length (default: 40)
- `maxGetResponse?: number` - Maximum GET RESPONSE iterations (default: 3)

**Returns:** `TransmitResult` object

##### `transmitWithRetry(command: Buffer, responseLength?: number, maxRetries?: number, retryDelayMs?: number): TransmitResult`

Transmit APDU command with automatic retry logic.

**Parameters:**
- `command: Buffer` - APDU command buffer
- `responseLength?: number` - Expected response length (default: 40)
- `maxRetries?: number` - Maximum retry attempts (default: 3)
- `retryDelayMs?: number` - Delay between retries in milliseconds (default: 100)

**Returns:** `TransmitResult` object

##### `disconnect(disposition?: Disposition): void`

Disconnect from card.

**Parameters:**
- `disposition?: Disposition` - Disposition mode (default: `Disposition.LeaveCard`)

### Types

#### `TransmitResult`

```typescript
interface TransmitResult {
  data: Buffer;  // Response data (excluding status word)
  sw1: number;   // Status word byte 1
  sw2: number;   // Status word byte 2
}
```

#### `CardStatus`

```typescript
interface CardStatus {
  present: boolean;  // Card is present in reader
  empty: boolean;    // Reader slot is empty
  mute: boolean;     // Card is mute (not responding)
  atr?: Buffer;      // ATR (Answer To Reset) - identifies card type
}
```

#### Enums

```typescript
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

## Error Handling

The library throws errors for common scenarios:

- Reader not found
- Card not present
- Communication errors
- Timeout errors

Always wrap calls in try-catch blocks:

```typescript
try {
  const card = reader.connect(readerName);
  const result = card.transmit(command);
  // Process result
} catch (error) {
  console.error('Error:', error.message);
}
```

## Performance Tips

1. **Reuse Card Connection** - Connect once and send multiple APDU commands
2. **Use Appropriate Response Length** - Set correct `responseLength` to avoid unnecessary data
3. **Enable Retry for Unreliable Cards** - Use `transmitWithRetry` for cards with communication issues
4. **Monitor Card Status** - Use `waitForCard` to detect card insertion/removal

## Troubleshooting

### No readers found

1. Ensure card reader is connected
2. Check PC/SC service is running:
   ```bash
   # Linux
   sudo systemctl status pcscd
   
   # macOS
   system_profiler SPUSBDataType | grep -i card
   ```

### Permission errors (Linux)

Add your user to the `pcscd` group:

```bash
sudo usermod -a -G pcscd $USER
# Log out and log back in
```

### Build errors

Install Rust toolchain:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

## License

MIT

# thai-smartcard
