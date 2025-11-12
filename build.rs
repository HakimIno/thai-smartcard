fn main() {
    // Enable pkg-config for cross-compilation (needed for pcsc-sys)
    // This allows pkg-config to work when cross-compiling to musl targets
    std::env::set_var("PKG_CONFIG_ALLOW_CROSS", "1");
    
    napi_build::setup();
}

