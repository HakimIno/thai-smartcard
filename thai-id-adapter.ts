/**
 * Thai ID Card Reader Adapter
 * 
 * Adapter that uses thai-smartcard to provide the same API as so-thai-id-reader
 * This allows seamless migration from so-thai-id-reader to thai-smartcard
 */

import {
  SmartCardReader,
  Card,
  ShareMode,
  Disposition,
} from './index';
import * as iconv from 'iconv-lite';

// APDU Commands for Thai ID Card
const APDU_COMMANDS = {
  SELECT: Buffer.from([0x00, 0xA4, 0x04, 0x00, 0x08, 0xA0, 0x00, 0x00, 0x00, 0x54, 0x48, 0x00, 0x01]),
  CID: Buffer.from([0x80, 0xB0, 0x00, 0x04, 0x02, 0x00, 0x0D]),
  THAI_NAME: Buffer.from([0x80, 0xB0, 0x00, 0x11, 0x02, 0x00, 0x64]),
  ENG_NAME: Buffer.from([0x80, 0xB0, 0x00, 0x75, 0x02, 0x00, 0x64]),
  BIRTH: Buffer.from([0x80, 0xB0, 0x00, 0xD9, 0x02, 0x00, 0x08]),
  GENDER: Buffer.from([0x80, 0xB0, 0x00, 0xE1, 0x02, 0x00, 0x01]),
  ADDRESS: Buffer.from([0x80, 0xB0, 0x15, 0x79, 0x02, 0x00, 0x64]),
  ISSUE: Buffer.from([0x80, 0xB0, 0x01, 0x67, 0x02, 0x00, 0x08]),
  EXPIRE: Buffer.from([0x80, 0xB0, 0x01, 0x6F, 0x02, 0x00, 0x08]),
} as const;

// Photo command generator
const photoPartCmd = (n: number): Buffer => {
  return Buffer.from([0x80, 0xB0, 0x7A, 0x5A + n, 0x02, 0x00, 0xFF]);
};

// Delays
const APDU_DELAY_MS = 30;
const SELECT_DELAY_MS = 50;
const CARD_READY_DELAY_MS = 200;

// Error messages
const ERROR_MESSAGES = {
  NO_CARD: 'ไม่พบบัตร',
  CARD_NOT_POWERED: 'บัตรไม่ได้รับไฟ กรุณาเสียบบัตรใหม่หรือตรวจสอบเครื่องอ่านบัตร',
  CARD_NOT_RESPONDING: 'บัตรไม่ตอบสนอง กรุณาเสียบบัตรใหม่',
  TIMEOUT: 'Timeout: บัตรไม่ตอบสนอง กรุณาเสียบบัตรใหม่',
  NO_READERS: 'ไม่พบเครื่องอ่านบัตร กรุณาตรวจสอบว่าเครื่องอ่านบัตรถูกเสียบแล้ว',
  GENERIC_ERROR: 'เกิดข้อผิดพลาดในการอ่านบัตร',
} as const;

/**
 * Thai ID Card Data Interface
 */
export interface ThaiIDCardData {
  citizenId: string;
  nameTh: string;
  nameEn: string;
  birthDate: string;
  gender: 'ชาย' | 'หญิง';
  address: string;
  issueDate: string;
  expireDate: string;
  photo?: string; // base64 encoded image
}

/**
 * Configuration options for ThaiIDCardReader
 */
export interface ThaiIDCardReaderOptions {
  /**
   * Timeout for reading card in milliseconds (default: 30000)
   */
  timeout?: number;
  
  /**
   * Reader name to use (optional)
   * If not provided, uses the first available reader
   */
  readerName?: string;
}

/**
 * Parse TIS-620 encoded text with proper encoding conversion
 * Uses iconv-lite for accurate TIS-620 to UTF-8 conversion
 */
function parseThaiText(data: Buffer): string {
  if (!data || data.length === 0) {
    return '';
  }

  // Find the end of actual data (remove null bytes and padding)
  let endIndex = data.length;
  while (endIndex > 0 && (data[endIndex - 1] === 0 || data[endIndex - 1] === 0x23)) {
    endIndex--;
  }

  if (endIndex === 0) {
    return '';
  }

  // Extract only the actual data
  const cleanData = data.slice(0, endIndex);

  try {
    // Use iconv-lite to decode TIS-620 to UTF-8
    // TIS-620 is the standard encoding for Thai characters on ID cards
    const decoded = iconv.decode(cleanData, 'tis620');
    
    // Remove control characters except space, newline, carriage return
    // and trim whitespace
    return decoded
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars
      .trim();
  } catch (error) {
    // Fallback: manual TIS-620 to Unicode conversion
    // TIS-620 range: 0xA1-0xFB (Thai characters)
    let result = '';
    for (let i = 0; i < cleanData.length; i++) {
      const byte = cleanData[i];
      
      // ASCII range (0x00-0x7F)
      if (byte < 0x80) {
        // Keep printable ASCII and whitespace
        if (byte >= 32 || byte === 10 || byte === 13) {
          result += String.fromCharCode(byte);
        }
      } else if (byte >= 0xA1 && byte <= 0xFB) {
        // TIS-620 Thai characters (0xA1-0xFB)
        // Map to Unicode Thai block (U+0E00-U+0E5B)
        const unicode = 0x0E00 + (byte - 0xA1);
        result += String.fromCharCode(unicode);
      }
      // Skip invalid bytes (0x80-0xA0, 0xFC-0xFF)
    }
    
    return result.trim();
  }
}

/**
 * Format date from YYYYMMDD format
 */
function formatDate(data: Buffer): string {
  if (data.length < 8) {
    return '';
  }
  try {
    const year = data.slice(0, 4).toString('ascii');
    const month = data.slice(4, 6).toString('ascii');
    const day = data.slice(6, 8).toString('ascii');
    return `${year}-${month}-${day}`;
  } catch {
    return '';
  }
}

/**
 * Parse gender from byte data
 */
function parseGender(data: Buffer): 'ชาย' | 'หญิง' | '' {
  if (!data || data.length === 0) {
    return '';
  }

  const genderByte = data[0];
  
  if (genderByte === 1 || genderByte === 0x31) {
    return 'ชาย';
  } else if (genderByte === 2 || genderByte === 0x32) {
    return 'หญิง';
  }
  
  return '';
}

/**
 * Thai ID Card Reader
 * 
 * Adapter that uses thai-smartcard to read Thai national ID card data
 * Provides the same API as so-thai-id-reader for seamless migration
 */
export class ThaiIDCardReader {
  private reader: SmartCardReader;
  private timeout: number;

  constructor(options?: ThaiIDCardReaderOptions) {
    this.reader = new SmartCardReader();
    this.timeout = options?.timeout || 30000;
  }

  /**
   * List available card readers
   * 
   * @returns Promise resolving to array of reader names
   */
  static async listReaders(): Promise<string[]> {
    const reader = new SmartCardReader();
    try {
      return reader.listReaders();
    } catch (error) {
      throw new Error(ERROR_MESSAGES.NO_READERS);
    }
  }

  /**
   * Send APDU command with retry logic
   */
  private async sendAPDU(
    card: Card,
    command: Buffer,
    responseLength: number = 40,
    maxRetries: number = 3
  ): Promise<Buffer> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = card.transmitWithRetry(command, responseLength, 1, 100);
        
        // Success or more data available
        if (result.sw1 === 0x90 && result.sw2 === 0x00 || result.sw1 === 0x61) {
          return result.data;
        }

        // If not successful and not last attempt, wait and retry
        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          continue;
        }

        throw new Error(`APDU Error: SW=${result.sw1.toString(16).padStart(2, '0')}${result.sw2.toString(16).padStart(2, '0')}`);
      } catch (error: any) {
        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          continue;
        }
        throw error;
      }
    }

    throw new Error('Failed to send APDU command');
  }

  /**
   * Read card data from connected card
   */
  private async readCardData(card: Card): Promise<ThaiIDCardData> {
    // SELECT application
    await this.sendAPDU(card, APDU_COMMANDS.SELECT, 40);
    await new Promise((resolve) => setTimeout(resolve, SELECT_DELAY_MS));

    // Read all data fields sequentially (required for card communication)
    const cidData = await this.sendAPDU(card, APDU_COMMANDS.CID, 40);
    await new Promise((resolve) => setTimeout(resolve, APDU_DELAY_MS));

    const nameThData = await this.sendAPDU(card, APDU_COMMANDS.THAI_NAME, 100);
    await new Promise((resolve) => setTimeout(resolve, APDU_DELAY_MS));

    const nameEnData = await this.sendAPDU(card, APDU_COMMANDS.ENG_NAME, 100);
    await new Promise((resolve) => setTimeout(resolve, APDU_DELAY_MS));

    const birthData = await this.sendAPDU(card, APDU_COMMANDS.BIRTH, 8);
    await new Promise((resolve) => setTimeout(resolve, APDU_DELAY_MS));

    const genderData = await this.sendAPDU(card, APDU_COMMANDS.GENDER, 1);
    await new Promise((resolve) => setTimeout(resolve, APDU_DELAY_MS));

    const addressData = await this.sendAPDU(card, APDU_COMMANDS.ADDRESS, 100);
    await new Promise((resolve) => setTimeout(resolve, APDU_DELAY_MS));

    const issueData = await this.sendAPDU(card, APDU_COMMANDS.ISSUE, 8);
    await new Promise((resolve) => setTimeout(resolve, APDU_DELAY_MS));

    const expireData = await this.sendAPDU(card, APDU_COMMANDS.EXPIRE, 8);
    await new Promise((resolve) => setTimeout(resolve, APDU_DELAY_MS));

    // Read photo (each part can be up to 255 bytes)
    const photoParts: Buffer[] = [];
    for (let i = 0; i < 20; i++) {
      try {
        const part = await this.sendAPDU(card, photoPartCmd(i), 255);
        photoParts.push(part);
        await new Promise((resolve) => setTimeout(resolve, APDU_DELAY_MS));
      } catch {
        // Stop if no more photo parts or error
        break;
      }
    }

    // Parse data
    const citizenId = cidData.length >= 13
      ? cidData.slice(0, 13).toString('ascii').replace(/\0/g, '').replace(/\s/g, '')
      : '';

    const nameTh = parseThaiText(nameThData);
    const nameEn = parseThaiText(nameEnData);
    const birthDate = formatDate(birthData);
    const gender = parseGender(genderData);
    const address = parseThaiText(addressData);
    const issueDate = formatDate(issueData);

    let expireDate = '';
    if (expireData && expireData.length > 0 && expireData[0] === 0) {
      expireDate = 'ตลอดชีพ';
    } else {
      expireDate = formatDate(expireData);
    }

    const photo = photoParts.length > 0
      ? Buffer.concat(photoParts).toString('base64')
      : '';

    return {
      citizenId,
      nameTh,
      nameEn,
      birthDate,
      gender: gender || 'ชาย',
      address,
      issueDate,
      expireDate,
      photo: photo || undefined,
    };
  }

  /**
   * Read card data from the ID card
   * 
   * @param readerName Optional reader name. If not provided, uses the first available reader
   * @returns Promise resolving to ThaiIDCardData
   * @throws Error if card cannot be read
   */
  async readCard(readerName?: string): Promise<ThaiIDCardData> {
    const readers = this.reader.listReaders();
    
    if (readers.length === 0) {
      throw new Error(ERROR_MESSAGES.NO_READERS);
    }

    // Select reader
    let selectedReader: string;
    if (readerName) {
      const found = readers.find(r => 
        r === readerName || 
        r.includes(readerName) || 
        readerName.includes(r)
      );
      if (!found) {
        throw new Error(ERROR_MESSAGES.NO_READERS);
      }
      selectedReader = found;
    } else {
      selectedReader = readers[0];
    }

    // Wait for card to be present
    let cardStatus = this.reader.getStatus(selectedReader);
    if (!cardStatus.present) {
      try {
        cardStatus = await this.reader.waitForCard(selectedReader, Math.min(5000, this.timeout));
      } catch {
        throw new Error(ERROR_MESSAGES.NO_CARD);
      }
    }

    if (!cardStatus.present) {
      throw new Error(ERROR_MESSAGES.NO_CARD);
    }

    // Wait for card to be ready
    await new Promise((resolve) => setTimeout(resolve, CARD_READY_DELAY_MS));

    // Connect to card
    let card: Card | null = null;
    try {
      card = this.reader.connect(selectedReader, ShareMode.Shared);
      
      // Wait a bit for card to be ready
      await new Promise((resolve) => setTimeout(resolve, CARD_READY_DELAY_MS));

      // Read card data
      const data = await this.readCardData(card);
      return data;
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      if (errorMessage.includes('timeout')) {
        throw new Error(ERROR_MESSAGES.TIMEOUT);
      } else if (errorMessage.includes('unpowered') || errorMessage.includes('power')) {
        throw new Error(ERROR_MESSAGES.CARD_NOT_POWERED);
      } else if (errorMessage.includes('unresponsive') || errorMessage.includes('respond')) {
        throw new Error(ERROR_MESSAGES.CARD_NOT_RESPONDING);
      } else if (errorMessage.includes('No card') || errorMessage.includes(ERROR_MESSAGES.NO_CARD)) {
        throw new Error(ERROR_MESSAGES.NO_CARD);
      } else {
        throw new Error(errorMessage || ERROR_MESSAGES.GENERIC_ERROR);
      }
    } finally {
      if (card) {
        try {
          card.disconnect(Disposition.LeaveCard);
        } catch {
          // Ignore disconnect errors
        }
      }
    }
  }
}

// Default export
export default ThaiIDCardReader;

