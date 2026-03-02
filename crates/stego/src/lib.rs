use wasm_bindgen::prelude::*;

const MAGIC: [u8; 3] = *b"EDD";
const HEADER_SIZE: usize = 10; // 3 salt + 3 check + 4 length

struct BmpInfo {
    pixel_offset: usize,
    width: u32,
    height: u32,
}

fn parse_bmp(data: &[u8]) -> Result<BmpInfo, String> {
    if data.len() < 54 {
        return Err("File too small to be a valid BMP".into());
    }
    if data[0] != b'B' || data[1] != b'M' {
        return Err("Not a BMP file (missing BM signature)".into());
    }

    let pixel_offset = u32::from_le_bytes([data[10], data[11], data[12], data[13]]) as usize;
    // DIB header starts at offset 14; width is at 18, height at 22, bpp at 28
    let width = u32::from_le_bytes([data[18], data[19], data[20], data[21]]);
    let height_raw = i32::from_le_bytes([data[22], data[23], data[24], data[25]]);
    let height = height_raw.unsigned_abs();
    let bpp = u16::from_le_bytes([data[28], data[29]]);

    if bpp != 24 {
        return Err(format!("Only 24-bit BMP supported, got {bpp}-bit"));
    }
    if pixel_offset >= data.len() {
        return Err("Invalid pixel data offset".into());
    }

    Ok(BmpInfo {
        pixel_offset,
        width,
        height,
    })
}

fn usable_byte_indices(pixel_offset: usize, width: u32, height: u32) -> Vec<usize> {
    let row_data = width as usize * 3;
    let row_stride = (row_data + 3) & !3; // align to 4 bytes
    let mut indices = Vec::with_capacity(row_data * height as usize);

    for row in 0..height as usize {
        let row_start = pixel_offset + row * row_stride;
        for col in 0..row_data {
            indices.push(row_start + col);
        }
    }

    indices
}

/// Read N bytes from the LSBs starting at bit offset `start_bit`.
fn read_lsb_bytes(data: &[u8], indices: &[usize], start_bit: usize, count: usize) -> Vec<u8> {
    let mut result = vec![0u8; count];
    for (byte_idx, out_byte) in result.iter_mut().enumerate() {
        for bit_pos in (0..8).rev() {
            let idx = start_bit + byte_idx * 8 + (7 - bit_pos);
            let bit = data[indices[idx]] & 1;
            *out_byte |= bit << bit_pos;
        }
    }
    result
}

/// Write bytes into the LSBs starting at bit offset `start_bit`.
fn write_lsb_bytes(data: &mut [u8], indices: &[usize], start_bit: usize, bytes: &[u8]) {
    let mut bit_idx = start_bit;
    for byte in bytes {
        for bit_pos in (0..8).rev() {
            let bit = (byte >> bit_pos) & 1;
            let i = indices[bit_idx];
            data[i] = (data[i] & 0xFE) | bit;
            bit_idx += 1;
        }
    }
}

#[wasm_bindgen]
pub fn encode(bmp_data: &[u8], message: &[u8]) -> Result<Vec<u8>, String> {
    let info = parse_bmp(bmp_data)?;
    let indices = usable_byte_indices(info.pixel_offset, info.width, info.height);

    let total_bits = (HEADER_SIZE + message.len()) * 8;
    if total_bits > indices.len() {
        let available = indices.len() / 8;
        let available = available.saturating_sub(HEADER_SIZE);
        return Err(format!(
            "Message too large: need {} bytes but only {} available",
            message.len(),
            available
        ));
    }

    // Build header: [3 salt] [3 check] [4 length BE]
    let mut salt = [0u8; 3];
    getrandom::getrandom(&mut salt).map_err(|e| format!("RNG error: {e}"))?;
    let check = [
        salt[0] ^ MAGIC[0],
        salt[1] ^ MAGIC[1],
        salt[2] ^ MAGIC[2],
    ];
    let len_bytes = (message.len() as u32).to_be_bytes();

    let mut header = [0u8; HEADER_SIZE];
    header[0..3].copy_from_slice(&salt);
    header[3..6].copy_from_slice(&check);
    header[6..10].copy_from_slice(&len_bytes);

    let mut data = bmp_data.to_vec();
    write_lsb_bytes(&mut data, &indices, 0, &header);
    write_lsb_bytes(&mut data, &indices, HEADER_SIZE * 8, message);

    Ok(data)
}

#[wasm_bindgen]
pub fn decode(bmp_data: &[u8]) -> Result<Vec<u8>, String> {
    let info = parse_bmp(bmp_data)?;
    let indices = usable_byte_indices(info.pixel_offset, info.width, info.height);

    if indices.len() < HEADER_SIZE * 8 {
        return Err("Image too small to contain a hidden message".into());
    }

    // Read and verify magic: salt ^ check must equal "EDD"
    let header = read_lsb_bytes(bmp_data, &indices, 0, 6);
    let salt = &header[0..3];
    let check = &header[3..6];

    if salt[0] ^ check[0] != MAGIC[0]
        || salt[1] ^ check[1] != MAGIC[1]
        || salt[2] ^ check[2] != MAGIC[2]
    {
        return Err("No hidden message found in this image".into());
    }

    // Read length
    let len_bytes = read_lsb_bytes(bmp_data, &indices, 48, 4);
    let msg_len = u32::from_be_bytes([len_bytes[0], len_bytes[1], len_bytes[2], len_bytes[3]]) as usize;

    let total_bits = (HEADER_SIZE + msg_len) * 8;
    if total_bits > indices.len() {
        return Err(format!(
            "Encoded length ({msg_len} bytes) exceeds image capacity"
        ));
    }

    let message = read_lsb_bytes(bmp_data, &indices, HEADER_SIZE * 8, msg_len);
    Ok(message)
}

#[wasm_bindgen]
pub fn capacity(bmp_data: &[u8]) -> Result<u32, String> {
    let info = parse_bmp(bmp_data)?;
    let total_usable = (info.width as usize * 3 * info.height as usize) / 8;
    Ok(total_usable.saturating_sub(HEADER_SIZE) as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Create a minimal 24-bit BMP in memory with the given dimensions.
    fn make_bmp(width: u32, height: u32) -> Vec<u8> {
        let row_data = width as usize * 3;
        let row_stride = (row_data + 3) & !3;
        let pixel_data_size = row_stride * height as usize;
        let file_size = 54 + pixel_data_size;

        let mut data = vec![0u8; file_size];

        // BM signature
        data[0] = b'B';
        data[1] = b'M';

        // File size
        let fs = file_size as u32;
        data[2..6].copy_from_slice(&fs.to_le_bytes());

        // Pixel data offset
        data[10..14].copy_from_slice(&54u32.to_le_bytes());

        // DIB header size (BITMAPINFOHEADER = 40)
        data[14..18].copy_from_slice(&40u32.to_le_bytes());

        // Width
        data[18..22].copy_from_slice(&width.to_le_bytes());

        // Height (positive = bottom-up)
        data[22..26].copy_from_slice(&(height as i32).to_le_bytes());

        // Planes
        data[26..28].copy_from_slice(&1u16.to_le_bytes());

        // Bits per pixel
        data[28..30].copy_from_slice(&24u16.to_le_bytes());

        // Fill pixel data with 0xFF (white)
        for i in 54..data.len() {
            data[i] = 0xFF;
        }

        data
    }

    #[test]
    fn roundtrip_basic() {
        let bmp = make_bmp(10, 10);
        let message = b"Hello, steganography!";

        let encoded = encode(&bmp, message).unwrap();
        let decoded = decode(&encoded).unwrap();

        assert_eq!(decoded, message);
    }

    #[test]
    fn roundtrip_empty_message() {
        let bmp = make_bmp(10, 10);
        let message = b"";

        let encoded = encode(&bmp, message).unwrap();
        let decoded = decode(&encoded).unwrap();

        assert_eq!(decoded, message);
    }

    #[test]
    fn roundtrip_binary_data() {
        let bmp = make_bmp(30, 24);
        let message: Vec<u8> = (0..=255).collect();

        let encoded = encode(&bmp, &message).unwrap();
        let decoded = decode(&encoded).unwrap();

        assert_eq!(decoded, message);
    }

    #[test]
    fn capacity_calculation() {
        let bmp = make_bmp(10, 10);
        let cap = capacity(&bmp).unwrap();
        // 10 * 3 * 10 = 300 usable bits, 300 / 8 = 37, 37 - 10 = 27
        assert_eq!(cap, 27);
    }

    #[test]
    fn capacity_with_padding() {
        // Width 5: row_data = 15, usable = 5*3*4 = 60, 60/8 = 7, 7 - 10 = saturates to 0
        let bmp = make_bmp(5, 4);
        let cap = capacity(&bmp).unwrap();
        assert_eq!(cap, 0);
    }

    #[test]
    fn roundtrip_with_padding() {
        // Width 5 causes 1 byte of row padding
        let bmp = make_bmp(5, 10);
        let cap = capacity(&bmp).unwrap();
        // 5*3*10 = 150, 150/8 = 18, 18 - 10 = 8
        assert_eq!(cap, 8);
        let msg = b"Hi";

        let encoded = encode(&bmp, msg).unwrap();
        let decoded = decode(&encoded).unwrap();

        assert_eq!(decoded, msg);
    }

    #[test]
    fn reject_non_bmp() {
        let data = vec![0u8; 100];
        assert!(encode(&data, b"test").is_err());
        assert!(decode(&data).is_err());
        assert!(capacity(&data).is_err());
    }

    #[test]
    fn reject_too_small() {
        let data = vec![0u8; 10];
        assert!(encode(&data, b"test").is_err());
    }

    #[test]
    fn reject_message_exceeds_capacity() {
        let bmp = make_bmp(2, 2);
        let long_msg = vec![b'A'; 100];
        assert!(encode(&bmp, &long_msg).is_err());
    }

    #[test]
    fn parse_bmp_rejects_non_24bit() {
        let mut data = make_bmp(10, 10);
        data[28..30].copy_from_slice(&32u16.to_le_bytes());
        assert!(parse_bmp(&data).is_err());
    }

    #[test]
    fn decode_rejects_unencoded_image() {
        let bmp = make_bmp(20, 20);
        let err = decode(&bmp).unwrap_err();
        assert_eq!(err, "No hidden message found in this image");
    }

    #[test]
    fn magic_header_verified() {
        let bmp = make_bmp(10, 10);
        let encoded = encode(&bmp, b"test").unwrap();

        // Read the first 6 bytes from LSBs and verify XOR = "EDD"
        let info = parse_bmp(&encoded).unwrap();
        let indices = usable_byte_indices(info.pixel_offset, info.width, info.height);
        let header = read_lsb_bytes(&encoded, &indices, 0, 6);

        assert_eq!(header[0] ^ header[3], b'E');
        assert_eq!(header[1] ^ header[4], b'D');
        assert_eq!(header[2] ^ header[5], b'D');
    }
}
