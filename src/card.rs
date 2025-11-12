use crate::types::{CardStatus, TransmitResult};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use pcsc::State;
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[napi]
pub struct Card {
    pub(crate) inner: Arc<Mutex<pcsc::Card>>,
    pub(crate) atr: Option<Buffer>,
}

#[napi]
impl Card {
    #[napi]
    pub fn get_atr(&self) -> Option<Buffer> {
        self.atr.clone()
    }

    #[napi]
    pub fn get_status(&self) -> Result<CardStatus> {
        let card = self.inner.lock()
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to lock card: {}", e)))?;
        
        let card_status = card.status2_owned()
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to get card status: {:?}", e)))?;
        
        let status = card_status.status();
        let atr = if card_status.atr().is_empty() {
            None
        } else {
            Some(Buffer::from(card_status.atr().to_vec()))
        };
        Ok(CardStatus {
            present: (status.bits() & State::PRESENT.bits()) != 0,
            empty: (status.bits() & State::EMPTY.bits()) != 0,
            mute: (status.bits() & State::MUTE.bits()) != 0,
            atr,
        })
    }

    #[napi]
    pub fn transmit(&self, command: Buffer, response_length: u32, max_get_response: Option<u32>) -> Result<TransmitResult> {
        let card = self.inner.lock()
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to lock card: {}", e)))?;
        
        let cmd = command.as_ref();
        let mut response = vec![0u8; response_length as usize + 2];
        
        let response_data = card.transmit(cmd, &mut response)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to transmit APDU: {}", e)))?;
        let response_len = response_data.len();
        
        let sw1 = if response_len >= 2 { response[response_len - 2] } else { 0 };
        let sw2 = if response_len >= 1 { response[response_len - 1] } else { 0 };
        
        let mut data = if response_len >= 2 {
            let data_end = response_len - 2;
            response[..data_end].to_vec()
        } else {
            vec![]
        };
        
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
                        let data_len = get_response_len - 2;
                        if data_len > 0 {
                            let get_data = &get_response[..data_len];
                            data.extend_from_slice(get_data);
                        }
                        break;
                    } else if get_sw1 == 0x61 {
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
        
        let cmd_vec = command.as_ref().to_vec();
        
        for attempt in 0..max_retries {
            match self.transmit(Buffer::from(cmd_vec.clone()), response_length, Some(3)) {
                Ok(result) => {
                    if result.sw1 == 0x90 && result.sw2 == 0x00 {
                        return Ok(result);
                    } else if result.sw1 == 0x61 {
                        return Ok(result);
                    } else if attempt < max_retries - 1 {
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

    #[napi]
    pub fn disconnect(&self, disposition: u32) -> Result<()> {
        let _ = disposition;
        Ok(())
    }
}

