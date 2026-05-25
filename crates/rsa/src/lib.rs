use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use rand::{thread_rng, Rng};
use rsa::{Pkcs1v15Encrypt, RsaPrivateKey, RsaPublicKey};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Serialize, Deserialize)]
struct PublicKeyStore {
    public_key: RsaPublicKey,
}

#[derive(Serialize, Deserialize)]
struct PrivateKeyStore {
    private_key: RsaPrivateKey,
}

#[derive(Serialize)]
struct KeyPairJson {
    public_key_json: String,
    private_key_json: String,
}

#[derive(Serialize)]
struct EncryptOut {
    ciphertext: Vec<u8>,
    encrypted_key: Vec<u8>,
}

fn err<E: std::fmt::Display>(e: E) -> JsValue {
    JsValue::from_str(&e.to_string())
}

/// Generate a 2048-bit RSA keypair. Returns `{public_key_json, private_key_json}`
/// as a JSON string — each value is itself the JSON payload of the corresponding
/// key file (same shape as the CLI practice).
#[wasm_bindgen]
pub fn generate_keys(bits: Option<u32>) -> Result<String, JsValue> {
    let bits = bits.unwrap_or(2048) as usize;
    let mut rng = thread_rng();
    let priv_key = RsaPrivateKey::new(&mut rng, bits).map_err(err)?;
    let pub_key = RsaPublicKey::from(&priv_key);

    let pub_json = serde_json::to_string_pretty(&PublicKeyStore { public_key: pub_key })
        .map_err(err)?;
    let priv_json = serde_json::to_string_pretty(&PrivateKeyStore { private_key: priv_key })
        .map_err(err)?;

    serde_json::to_string(&KeyPairJson {
        public_key_json: pub_json,
        private_key_json: priv_json,
    })
    .map_err(err)
}

/// Hybrid encryption: AES-256-GCM with a fresh key+nonce, then encrypt the AES
/// key with the recipient's RSA public key (PKCS#1 v1.5).
///
/// Output ciphertext layout matches the CLI practice: `[12-byte nonce || aes-gcm ciphertext]`.
#[wasm_bindgen]
pub fn encrypt_file(file: &[u8], public_key_json: &str) -> Result<JsValue, JsValue> {
    let pub_store: PublicKeyStore = serde_json::from_str(public_key_json).map_err(err)?;

    let mut aes_key_bytes = [0u8; 32];
    thread_rng().fill(&mut aes_key_bytes);
    let key = Key::<Aes256Gcm>::from_slice(&aes_key_bytes);
    let cipher = Aes256Gcm::new(key);

    let mut nonce_bytes = [0u8; 12];
    thread_rng().fill(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher.encrypt(nonce, file).map_err(err)?;

    let mut final_ciphertext = nonce_bytes.to_vec();
    final_ciphertext.extend(ciphertext);

    let mut rng = thread_rng();
    let enc_aes_key = pub_store
        .public_key
        .encrypt(&mut rng, Pkcs1v15Encrypt, &aes_key_bytes)
        .map_err(err)?;

    let out = EncryptOut {
        ciphertext: final_ciphertext,
        encrypted_key: enc_aes_key,
    };
    serde_wasm_bindgen::to_value(&out).map_err(err)
}

/// Inverse of [`encrypt_file`]. Returns the decrypted plaintext bytes.
#[wasm_bindgen]
pub fn decrypt_file(
    ciphertext_with_nonce: &[u8],
    encrypted_key: &[u8],
    private_key_json: &str,
) -> Result<Vec<u8>, JsValue> {
    let priv_store: PrivateKeyStore = serde_json::from_str(private_key_json).map_err(err)?;

    let aes_key_bytes = priv_store
        .private_key
        .decrypt(Pkcs1v15Encrypt, encrypted_key)
        .map_err(|_| JsValue::from_str("RSA decryption failed (wrong private key?)"))?;

    if aes_key_bytes.len() != 32 {
        return Err(JsValue::from_str("Decrypted AES key has wrong length"));
    }

    let key = Key::<Aes256Gcm>::from_slice(&aes_key_bytes);
    let cipher = Aes256Gcm::new(key);

    if ciphertext_with_nonce.len() < 12 {
        return Err(JsValue::from_str("Ciphertext too short"));
    }
    let (nonce_bytes, real_ciphertext) = ciphertext_with_nonce.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    cipher
        .decrypt(nonce, real_ciphertext)
        .map_err(|_| JsValue::from_str("AES-GCM decryption failed (corrupted or wrong key)"))
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;

    #[test]
    fn round_trip_small_key() {
        // 1024 bits to keep test fast.
        let pair_json = generate_keys(Some(1024)).expect("keygen");
        let parsed: serde_json::Value = serde_json::from_str(&pair_json).unwrap();
        let pub_json = parsed["public_key_json"].as_str().unwrap().to_string();
        let priv_json = parsed["private_key_json"].as_str().unwrap().to_string();

        let plaintext = b"hello cryptographic world!";

        // We can't call the wasm_bindgen wrappers directly in native tests because
        // they return JsValue. Do the same flow manually here against the JSON keys.
        let pub_store: PublicKeyStore = serde_json::from_str(&pub_json).unwrap();
        let priv_store: PrivateKeyStore = serde_json::from_str(&priv_json).unwrap();

        let mut aes_key_bytes = [0u8; 32];
        thread_rng().fill(&mut aes_key_bytes);
        let key = Key::<Aes256Gcm>::from_slice(&aes_key_bytes);
        let cipher = Aes256Gcm::new(key);

        let mut nonce_bytes = [0u8; 12];
        thread_rng().fill(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ct = cipher.encrypt(nonce, plaintext.as_ref()).unwrap();
        let mut final_ct = nonce_bytes.to_vec();
        final_ct.extend(ct);

        let mut rng = thread_rng();
        let enc_key = pub_store
            .public_key
            .encrypt(&mut rng, Pkcs1v15Encrypt, &aes_key_bytes)
            .unwrap();

        // --- decrypt ---
        let aes_key_back = priv_store
            .private_key
            .decrypt(Pkcs1v15Encrypt, &enc_key)
            .unwrap();
        assert_eq!(aes_key_back.len(), 32);
        let key2 = Key::<Aes256Gcm>::from_slice(&aes_key_back);
        let cipher2 = Aes256Gcm::new(key2);
        let (n2, c2) = final_ct.split_at(12);
        let pt = cipher2.decrypt(Nonce::from_slice(n2), c2).unwrap();
        assert_eq!(pt, plaintext);
    }
}
