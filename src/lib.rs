use napi::bindgen_prelude::*;
use napi_derive::napi;
use pcsc::{Context, Scope, ShareMode, Protocols, State};
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[napi]
pub struct SmartCardReader {
    ctx: Arc<Mutex<Context>>,
}

#[napi]
impl SmartCardReader {
    #[napi(constructor)]
    pub fn new() -> Result<Self> {
        let ctx = Context::establish(Scope::User)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to establish PC/SC context: {}", e)))?;
        
        Ok(Self {
            ctx: Arc::new(Mutex::new(ctx)),
        })
    }

    /// List available card readers
    #[napi]
    pub fn list_readers(&self) -> Result<Vec<String>> {
        let ctx = self.ctx.lock()
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to lock context: {}", e)))?;
        
        // Allocate buffer for reader names
        let mut buffer = vec![0u8; 1024];
        let readers = ctx.list_readers(&mut buffer)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to list readers: {}", e)))?;
        
        let reader_vec: Vec<_> = readers.collect();
        Ok(reader_vec.iter().map(|r| r.to_string_lossy().to_string()).collect())
    }

    /// Get card status for a specific reader
    #[napi]
    pub fn get_status(&self, reader_name: String) -> Result<CardStatus> {
        let ctx = self.ctx.lock()
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to lock context: {}", e)))?;
        
        let mut buffer = vec![0u8; 1024];
        let readers = ctx.list_readers(&mut buffer)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to list readers: {}", e)))?;
        
        let reader_vec: Vec<_> = readers.collect();
        let reader = reader_vec.iter()
            .find(|r| r.to_string_lossy() == reader_name)
            .ok_or_else(|| napi::Error::new(napi::Status::GenericFailure, format!("Reader not found: {}", reader_name)))?;
        
        // Use ReaderState to get status
        use pcsc::ReaderState;
        use std::ffi::CString;
        let reader_cstr = CString::new(reader.to_string_lossy().as_ref())
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to convert reader name: {}", e)))?;
        let mut reader_states = vec![ReaderState::new(reader_cstr, State::UNAWARE)];
        ctx.get_status_change(Duration::from_secs(0), &mut reader_states)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to get status: {:?}", e)))?;
        
        let state = reader_states[0].event_state();
        
        Ok(CardStatus {
            present: state.contains(State::PRESENT),
            empty: state.contains(State::EMPTY),
            mute: state.contains(State::MUTE),
            atr: None, // ATR handling can be added if needed
        })
    }

    /// Connect to a card reader
    #[napi]
    pub fn connect(&self, reader_name: String, share_mode: u32, preferred_protocols: Option<u32>) -> Result<Card> {
        let ctx = self.ctx.lock()
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to lock context: {}", e)))?;
        
        let mut buffer = vec![0u8; 1024];
        let readers = ctx.list_readers(&mut buffer)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to list readers: {}", e)))?;
        
        let reader_vec: Vec<_> = readers.collect();
        let reader = reader_vec.iter()
            .find(|r| r.to_string_lossy() == reader_name)
            .ok_or_else(|| napi::Error::new(napi::Status::GenericFailure, format!("Reader not found: {}", reader_name)))?;
        
        let share_mode = match share_mode {
            0 => ShareMode::Shared,
            1 => ShareMode::Exclusive,
            _ => ShareMode::Direct,
        };
        
        let protocols = match preferred_protocols {
            Some(0) => Protocols::T0,
            Some(1) => Protocols::T1,
            Some(2) => Protocols::RAW,
            _ => Protocols::ANY,
        };
        
        let card = ctx.connect(&*reader, share_mode, protocols)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to connect to card: {}", e)))?;
        
        // Get ATR from card status - status() returns (Status, Protocol), ATR not directly available
        // We'll get it from ReaderState if needed, but for now set to None
        let atr = None;
        
        Ok(Card { 
            inner: Arc::new(Mutex::new(card)),
            atr,
        })
    }

    /// Wait for card status change
    #[napi]
    pub async fn wait_for_card(&self, reader_name: String, timeout_ms: u32) -> Result<CardStatus> {
        let ctx = self.ctx.lock()
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to lock context: {}", e)))?;
        
        let mut buffer = vec![0u8; 1024];
        let readers = ctx.list_readers(&mut buffer)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to list readers: {}", e)))?;
        
        let reader_vec: Vec<_> = readers.collect();
        let reader = reader_vec.iter()
            .find(|r| r.to_string_lossy() == reader_name)
            .ok_or_else(|| napi::Error::new(napi::Status::GenericFailure, format!("Reader not found: {}", reader_name)))?;
        
        let timeout = Duration::from_millis(timeout_ms as u64);
        // Use get_status_change with proper API - requires ReaderState
        use pcsc::ReaderState;
        use std::ffi::CString;
        let reader_cstr = CString::new(reader.to_string_lossy().as_ref())
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to convert reader name: {}", e)))?;
        let mut reader_states = vec![ReaderState::new(reader_cstr, State::UNAWARE)];
        ctx.get_status_change(timeout, &mut reader_states)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to get status change: {:?}", e)))?;
        
        let state = reader_states[0].event_state();
        
        Ok(CardStatus {
            present: state.contains(State::PRESENT),
            empty: state.contains(State::EMPTY),
            mute: state.contains(State::MUTE),
            atr: None,
        })
    }
}

#[napi]
pub struct Card {
    inner: Arc<Mutex<pcsc::Card>>,
    atr: Option<Buffer>,
}

#[napi]
impl Card {
    /// Get ATR (Answer To Reset) - identifies card type
    #[napi]
    pub fn get_atr(&self) -> Option<Buffer> {
        self.atr.clone()
    }

    /// Get card status
    #[napi]
    pub fn get_status(&self) -> Result<CardStatus> {
        let card = self.inner.lock()
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to lock card: {}", e)))?;
        
        let (status, _protocol) = card.status()
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to get card status: {:?}", e)))?;
        
        // ATR is not available from status() - would need status2() which requires buffers
        // Status is a bitflags, use bitwise AND with bits()
        Ok(CardStatus {
            present: (status.bits() & State::PRESENT.bits()) != 0,
            empty: (status.bits() & State::EMPTY.bits()) != 0,
            mute: (status.bits() & State::MUTE.bits()) != 0,
            atr: None, // ATR not available from status()
        })
    }

    /// Transmit APDU command with automatic GET RESPONSE handling
    #[napi]
    pub fn transmit(&self, command: Buffer, response_length: u32, max_get_response: Option<u32>) -> Result<TransmitResult> {
        let card = self.inner.lock()
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to lock card: {}", e)))?;
        
        let cmd = command.as_ref();
        let mut response = vec![0u8; response_length as usize + 2]; // +2 for status word
        
        let response_data = card.transmit(cmd, &mut response)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to transmit APDU: {}", e)))?;
        let response_len = response_data.len();
        
        // Extract status word (last 2 bytes)
        let sw1 = if response_len >= 2 { response[response_len - 2] } else { 0 };
        let sw2 = if response_len >= 1 { response[response_len - 1] } else { 0 };
        
        // Extract data (everything except last 2 bytes)
        let mut data = if response_len >= 2 {
            let data_end = response_len - 2;
            response[..data_end].to_vec()
        } else {
            vec![]
        };
        
        // Handle GET RESPONSE if needed (SW1 = 0x61 means more data available)
        let max_get_response = max_get_response.unwrap_or(3);
        if sw1 == 0x61 && max_get_response > 0 {
            let mut remaining = sw2 as usize;
            let mut get_response_count = 0;
            
            while remaining > 0 && get_response_count < max_get_response {
                let get_response_cmd = vec![0x00, 0xC0, 0x00, 0x00, remaining.min(0xFF) as u8];
                let mut get_response = vec![0u8; remaining.min(0xFF) + 2];
                
                let get_response_len: usize = match card.transmit(&get_response_cmd, &mut get_response) {
                    Ok(data) => data.len(),
                    Err(_) => break,
                };
                
                if get_response_len >= 2 {
                    let get_sw1 = get_response[get_response_len - 2];
                    let get_sw2 = get_response[get_response_len - 1];
                    
                    if get_sw1 == 0x90 && get_sw2 == 0x00 {
                        // Success - append data
                        let data_len = get_response_len - 2;
                        if data_len > 0 {
                            let get_data = &get_response[..data_len];
                            data.extend_from_slice(get_data);
                            remaining = remaining.saturating_sub(get_data.len());
                        }
                        break;
                    } else if get_sw1 == 0x61 {
                        // More data available
                        let data_len = get_response_len - 2;
                        if data_len > 0 {
                            let get_data = &get_response[..data_len];
                            data.extend_from_slice(get_data);
                        }
                        remaining = get_sw2 as usize;
                        get_response_count += 1;
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }
        }
        
        Ok(TransmitResult {
            data: Buffer::from(data),
            sw1,
            sw2,
        })
    }

    /// Transmit APDU command with retry logic
    #[napi]
    pub fn transmit_with_retry(
        &self,
        command: Buffer,
        response_length: u32,
        max_retries: Option<u32>,
        retry_delay_ms: Option<u32>,
    ) -> Result<TransmitResult> {
        let max_retries = max_retries.unwrap_or(3);
        let retry_delay = Duration::from_millis(retry_delay_ms.unwrap_or(100) as u64);
        
        let mut last_error = None;
        
        // Convert command to Vec for cloning
        let cmd_vec = command.as_ref().to_vec();
        
        for attempt in 0..max_retries {
            match self.transmit(Buffer::from(cmd_vec.clone()), response_length, Some(3)) {
                Ok(result) => {
                    // Check if status word indicates success
                    if result.sw1 == 0x90 && result.sw2 == 0x00 {
                        return Ok(result);
                    } else if result.sw1 == 0x61 {
                        // More data available - this is handled in transmit, so return
                        return Ok(result);
                    } else if attempt < max_retries - 1 {
                        // Retry on error
                        std::thread::sleep(retry_delay);
                        continue;
                    } else {
                        return Ok(result);
                    }
                }
                Err(e) => {
                    last_error = Some(e);
                    if attempt < max_retries - 1 {
                        std::thread::sleep(retry_delay);
                    }
                }
            }
        }
        
        Err(last_error.unwrap_or_else(|| {
            napi::Error::new(napi::Status::GenericFailure, "Failed to transmit APDU after retries".to_string())
        }))
    }

    /// Disconnect from card
    #[napi]
    pub fn disconnect(&self, disposition: u32) -> Result<()> {
        // Note: pcsc::Card::disconnect takes ownership, which is incompatible with Arc<Mutex<Card>>
        // The card will be automatically disconnected when the Card struct is dropped
        // This method is a no-op - the card will disconnect when dropped
        // If explicit disconnect is needed, the caller should drop the Card instance
        let _ = disposition;
        Ok(())
    }
}

#[napi(object)]
pub struct TransmitResult {
    pub data: Buffer,
    pub sw1: u8,
    pub sw2: u8,
}

#[napi(object)]
pub struct CardStatus {
    pub present: bool,
    pub empty: bool,
    pub mute: bool,
    pub atr: Option<Buffer>,
}

/// Get library version
#[napi]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
