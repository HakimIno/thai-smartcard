use crate::types::CardStatus;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use pcsc::{Context, ReaderState, Scope, ShareMode, Protocols, State};
use std::ffi::CString;
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

    #[napi]
    pub fn list_readers(&self) -> Result<Vec<String>> {
        let ctx = self.ctx.lock()
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to lock context: {}", e)))?;
        
        let mut buffer = vec![0u8; 1024];
        let readers = ctx.list_readers(&mut buffer)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, format!("Failed to list readers: {}", e)))?;
        
        let reader_vec: Vec<_> = readers.collect();
        Ok(reader_vec.iter().map(|r| r.to_string_lossy().to_string()).collect())
    }

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
            atr: None,
        })
    }

    #[napi]
    pub fn connect(&self, reader_name: String, share_mode: u32, preferred_protocols: Option<u32>) -> Result<crate::card::Card> {
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
        
        let atr = None;
        
        Ok(crate::card::Card { 
            inner: Arc::new(Mutex::new(card)),
            atr,
        })
    }

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

