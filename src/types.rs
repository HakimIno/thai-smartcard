use napi::bindgen_prelude::*;
use napi_derive::napi;

/// Result of APDU transmission
#[napi(object)]
pub struct TransmitResult {
    pub data: Buffer,
    pub sw1: u8,
    pub sw2: u8,
}

/// Card status information
#[napi(object)]
pub struct CardStatus {
    pub present: bool,
    pub empty: bool,
    pub mute: bool,
    pub atr: Option<Buffer>,
}

