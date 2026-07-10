use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use exif::{In, Tag, Value};
use image::codecs::jpeg::JpegEncoder;

pub const THUMBNAIL_MAX_DIMENSION: u32 = 512;
const THUMBNAIL_JPEG_QUALITY: u8 = 88;

/// Cache filenames include a version so existing low-resolution caches can be
/// upgraded lazily without making the first app launch do a full rescan.
pub fn thumbnail_cache_path(workspace_root: &Path, photo_id: &str) -> PathBuf {
    workspace_root
        .join(".photomanager")
        .join("thumbnails")
        .join(format!("{}.v2.jpg", photo_id))
}

pub fn import_preview_cache_path(workspace_root: &Path, cache_key: &str) -> PathBuf {
    workspace_root
        .join(".photomanager")
        .join("import-previews")
        .join(format!("{}.jpg", cache_key))
}

pub fn encode_thumbnail_jpeg(image: &image::DynamicImage) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    JpegEncoder::new_with_quality(&mut bytes, THUMBNAIL_JPEG_QUALITY)
        .encode_image(image)
        .map_err(|e| format!("缩略图编码失败: {}", e))?;
    Ok(bytes)
}

#[derive(Debug, Default, Clone)]
pub struct ImageMetadata {
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub date_taken: Option<String>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub lens_model: Option<String>,
    pub exposure_time: Option<String>,
    pub f_number: Option<f64>,
    pub iso: Option<i32>,
    pub focal_length: Option<f64>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
}

// Simple TIFF IFD parser to extract embedded JPEG preview offsets
struct TiffParser<'a, R: Read + Seek> {
    reader: &'a mut R,
    is_little_endian: bool,
    ifd0_offset: u32,
}

impl<'a, R: Read + Seek> TiffParser<'a, R> {
    fn new(reader: &'a mut R) -> std::io::Result<Self> {
        let mut header = [0u8; 8];
        reader.read_exact(&mut header)?;
        
        let is_little_endian = match &header[0..2] {
            b"II" => true,
            b"MM" => false,
            _ => return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "Not a TIFF file")),
        };
        
        let ifd0_offset = if is_little_endian {
            u32::from_le_bytes(header[4..8].try_into().unwrap())
        } else {
            u32::from_be_bytes(header[4..8].try_into().unwrap())
        };
        
        Ok(Self { reader, is_little_endian, ifd0_offset })
    }

    fn read_u16(&mut self) -> std::io::Result<u16> {
        let mut buf = [0u8; 2];
        self.reader.read_exact(&mut buf)?;
        if self.is_little_endian {
            Ok(u16::from_le_bytes(buf))
        } else {
            Ok(u16::from_be_bytes(buf))
        }
    }

    fn read_u32(&mut self) -> std::io::Result<u32> {
        let mut buf = [0u8; 4];
        self.reader.read_exact(&mut buf)?;
        if self.is_little_endian {
            Ok(u32::from_le_bytes(buf))
        } else {
            Ok(u32::from_be_bytes(buf))
        }
    }

    // Find all JPEG previews in TIFF structure (returns pairs of (offset, length))
    fn find_jpeg_previews(&mut self, ifd_offset: u32) -> std::io::Result<Vec<(u32, u32)>> {
        let mut previews = Vec::new();
        if ifd_offset == 0 {
            return Ok(previews);
        }

        self.reader.seek(SeekFrom::Start(ifd_offset as u64))?;
        let entry_count = self.read_u16()?;
        
        let mut jpeg_offset = 0;
        let mut jpeg_length = 0;
        let mut sub_ifds = Vec::new();

        for _ in 0..entry_count {
            let tag = self.read_u16()?;
            let _field_type = self.read_u16()?;
            let count = self.read_u32()?;
            let value_or_offset = self.read_u32()?;

            match tag {
                0x0201 => { // JPEGInterchangeFormat (offset to JPEG)
                    jpeg_offset = value_or_offset;
                }
                0x0202 => { // JPEGInterchangeFormatLength
                    jpeg_length = value_or_offset;
                }
                0x014a => { // SubIFDs
                    // If count is 1, value_or_offset is the offset of the SubIFD.
                    // If count > 1, it's an offset to an array of offsets.
                    if count == 1 {
                        sub_ifds.push(value_or_offset);
                    } else {
                        let current_pos = self.reader.stream_position()?;
                        self.reader.seek(SeekFrom::Start(value_or_offset as u64))?;
                        for _ in 0..count {
                            let mut buf = [0u8; 4];
                            self.reader.read_exact(&mut buf)?;
                            let offset = if self.is_little_endian {
                                u32::from_le_bytes(buf)
                            } else {
                                u32::from_be_bytes(buf)
                            };
                            sub_ifds.push(offset);
                        }
                        self.reader.seek(SeekFrom::Start(current_pos))?;
                    }
                }
                _ => {}
            }
        }

        if jpeg_offset > 0 && jpeg_length > 0 {
            previews.push((jpeg_offset, jpeg_length));
        }

        // Recursively check SubIFDs
        for sub_offset in sub_ifds {
            if let Ok(mut sub_previews) = self.find_jpeg_previews(sub_offset) {
                previews.append(&mut sub_previews);
            }
        }

        // Check next IFD
        let next_ifd_offset = self.read_u32()?;
        if next_ifd_offset > 0 {
            if let Ok(mut next_previews) = self.find_jpeg_previews(next_ifd_offset) {
                previews.append(&mut next_previews);
            }
        }

        Ok(previews)
    }
}

// Extract the largest embedded JPEG from a RAW file
pub fn extract_raw_preview<P: AsRef<Path>>(raw_path: P) -> std::io::Result<Vec<u8>> {
    let mut file = File::open(raw_path)?;
    let mut parser = TiffParser::new(&mut file)?;
    
    let ifd0_offset = parser.ifd0_offset;
    let previews = parser.find_jpeg_previews(ifd0_offset)?;
    if previews.is_empty() {
        return Err(std::io::Error::new(std::io::ErrorKind::NotFound, "No embedded JPEGs found"));
    }

    // Return the preview with the largest size (usually the full size preview)
    let largest = previews.iter().max_by_key(|(_, len)| len).cloned().unwrap();
    
    // Drop parser to release mutable borrow on file
    std::mem::drop(parser);
    
    let mut jpeg_data = vec![0u8; largest.1 as usize];
    file.seek(SeekFrom::Start(largest.0 as u64))?;
    file.read_exact(&mut jpeg_data)?;
    
    Ok(jpeg_data)
}

// Read EXIF metadata from file
pub fn read_exif_metadata<P: AsRef<Path>>(path: P) -> ImageMetadata {
    let mut meta = ImageMetadata::default();
    
    let file = match File::open(&path) {
        Ok(f) => f,
        Err(_) => return meta,
    };
    
    let mut reader = BufReader::new(file);
    let exif_reader = exif::Reader::new();
    let exif = match exif_reader.read_from_container(&mut reader) {
        Ok(e) => e,
        Err(_) => return meta,
    };

    // Helper to get string value
    let get_str = |tag: Tag| -> Option<String> {
        exif.get_field(tag, In::PRIMARY).map(|f| match &f.value {
            Value::Ascii(vec) => {
                if let Some(first) = vec.first() {
                    String::from_utf8_lossy(first).trim().to_string()
                } else {
                    "".to_string()
                }
            }
            _ => f.display_value().to_string(),
        })
    };

    meta.camera_make = get_str(Tag::Make);
    meta.camera_model = get_str(Tag::Model);
    meta.lens_model = get_str(Tag::LensModel);

    // Date Taken
    if let Some(date_field) = exif.get_field(Tag::DateTimeOriginal, In::PRIMARY) {
        let raw_date = date_field.display_value().to_string(); // Format: "2026:07:08 11:31:00"
        // Convert to standard format "2026-07-08 11:31:00"
        let standardized = raw_date.replace(":", "-").replacen("-", ":", 2);
        meta.date_taken = Some(standardized);
    }

    // Exposure parameters
    if let Some(field) = exif.get_field(Tag::ExposureTime, In::PRIMARY) {
        meta.exposure_time = Some(field.display_value().to_string());
    }

    if let Some(field) = exif.get_field(Tag::FNumber, In::PRIMARY) {
        match &field.value {
            Value::Rational(vec) => {
                if let Some(ratio) = vec.first() {
                    meta.f_number = Some(ratio.to_f64());
                }
            }
            _ => {}
        }
    }

    if let Some(field) = exif.get_field(Tag::ISOSpeed, In::PRIMARY) {
        match &field.value {
            Value::Short(vec) => {
                if let Some(val) = vec.first() {
                    meta.iso = Some(*val as i32);
                }
            }
            _ => {}
        }
    }

    if let Some(field) = exif.get_field(Tag::FocalLength, In::PRIMARY) {
        match &field.value {
            Value::Rational(vec) => {
                if let Some(ratio) = vec.first() {
                    meta.focal_length = Some(ratio.to_f64());
                }
            }
            _ => {}
        }
    }

    // GPS GPSLatitude & GPSLongitude
    let get_gps = |lat_tag: Tag, ref_tag: Tag| -> Option<f64> {
        let ref_val = get_str(ref_tag)?;
        let field = exif.get_field(lat_tag, In::PRIMARY)?;
        match &field.value {
            Value::Rational(vec) => {
                if vec.len() >= 3 {
                    let d = vec[0].to_f64();
                    let m = vec[1].to_f64();
                    let s = vec[2].to_f64();
                    let mut decimal = d + m / 60.0 + s / 3600.0;
                    if ref_val == "S" || ref_val == "W" {
                        decimal = -decimal;
                    }
                    Some(decimal)
                } else {
                    None
                }
            }
            _ => None,
        }
    };

    meta.latitude = get_gps(Tag::GPSLatitude, Tag::GPSLatitudeRef);
    meta.longitude = get_gps(Tag::GPSLongitude, Tag::GPSLongitudeRef);

    // Attempt to get pixel dimensions from EXIF tags
    let mut w = None;
    let mut h = None;
    if let Some(field) = exif.get_field(Tag::PixelXDimension, In::PRIMARY) {
        w = field.display_value().to_string().parse::<i32>().ok();
    }
    if let Some(field) = exif.get_field(Tag::PixelYDimension, In::PRIMARY) {
        h = field.display_value().to_string().parse::<i32>().ok();
    }

    // Read orientation to swap width/height if rotated 90/270 degrees
    let mut orientation = 1;
    if let Some(field) = exif.get_field(Tag::Orientation, In::PRIMARY) {
        orientation = match &field.value {
            Value::Short(vec) => vec.first().copied().unwrap_or(1) as u32,
            Value::Byte(vec) => vec.first().copied().unwrap_or(1) as u32,
            _ => 1,
        };
    }

    if orientation == 5 || orientation == 6 || orientation == 7 || orientation == 8 {
        meta.width = h;
        meta.height = w;
    } else {
        meta.width = w;
        meta.height = h;
    }

    meta
}

// Helper to get orientation from EXIF
pub fn get_orientation<P: AsRef<Path>>(path: P) -> u32 {
    let file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return 1,
    };
    let mut reader = BufReader::new(file);
    let exif_reader = exif::Reader::new();
    let exif = match exif_reader.read_from_container(&mut reader) {
        Ok(e) => e,
        Err(_) => return 1,
    };
    if let Some(field) = exif.get_field(Tag::Orientation, In::PRIMARY) {
        match &field.value {
            Value::Short(vec) => vec.first().copied().unwrap_or(1) as u32,
            Value::Byte(vec) => vec.first().copied().unwrap_or(1) as u32,
            _ => 1,
        }
    } else {
        1
    }
}

// Helper to rotate DynamicImage based on orientation value
pub fn rotate_image(img: image::DynamicImage, orientation: u32) -> image::DynamicImage {
    match orientation {
        2 => img.fliph(),
        3 => img.rotate180(),
        4 => img.flipv(),
        5 => img.fliph().rotate270(),
        6 => img.rotate90(),
        7 => img.fliph().rotate90(),
        8 => img.rotate270(),
        _ => img,
    }
}

// Generate thumbnail and save to cache path
pub fn generate_thumbnail<P: AsRef<Path>>(
    image_path: P,
    cache_path: P,
    is_raw: bool,
) -> Result<(i32, i32), String> {
    let img_bytes = if is_raw {
        extract_raw_preview(&image_path).map_err(|e| format!("RAW预览图提取失败: {}", e))?
    } else {
        // Read JPG bytes
        std::fs::read(&image_path).map_err(|e| format!("图片读取失败: {}", e))?
    };

    // Detect the input format instead of assuming JPEG so PNG files use the
    // same cache and preview pipeline as camera images.
    let img = image::load_from_memory(&img_bytes)
        .map_err(|e| format!("图片解码失败: {}", e))?;

    // Rotate based on EXIF orientation
    let orientation = get_orientation(&image_path);
    let img = if orientation != 1 {
        rotate_image(img, orientation)
    } else {
        img
    };

    let width = img.width() as i32;
    let height = img.height() as i32;

    // 512px is sharp on high-density photo cards while thumbnail() keeps the
    // fast box-sampled resize path used for responsive scrolling.
    let thumb = img.thumbnail(THUMBNAIL_MAX_DIMENSION, THUMBNAIL_MAX_DIMENSION);

    // Explicitly keep a higher JPEG quality than DynamicImage::write_to's
    // default so fine detail is not lost before the browser renders the card.
    let bytes = encode_thumbnail_jpeg(&thumb)?;
    std::fs::write(cache_path, bytes)
        .map_err(|e| format!("缩略图保存失败: {}", e))?;

    Ok((width, height))
}

// Extract a small embedded JPEG from a RAW file for thumbnail preview
pub fn extract_raw_small_preview<P: AsRef<Path>>(raw_path: P) -> std::io::Result<Vec<u8>> {
    let mut file = File::open(raw_path)?;
    let mut parser = TiffParser::new(&mut file)?;
    
    let ifd0_offset = parser.ifd0_offset;
    let previews = parser.find_jpeg_previews(ifd0_offset)?;
    if previews.is_empty() {
        return Err(std::io::Error::new(std::io::ErrorKind::NotFound, "No embedded JPEGs found"));
    }

    // Return the preview with the smallest size (usually the EXIF thumbnail)
    let smallest = previews.iter().min_by_key(|(_, len)| len).cloned().unwrap();
    
    std::mem::drop(parser);
    
    let mut jpeg_data = vec![0u8; smallest.1 as usize];
    file.seek(SeekFrom::Start(smallest.0 as u64))?;
    file.read_exact(&mut jpeg_data)?;
    
    Ok(jpeg_data)
}

// Extract the EXIF thumbnail directly from a JPEG file without decoding the full image
pub fn extract_jpeg_exif_thumbnail<P: AsRef<Path>>(path: P) -> Option<Vec<u8>> {
    let mut file = File::open(path).ok()?;
    let mut buf = [0u8; 2];
    
    // Read SOI marker (should be FFD8)
    file.read_exact(&mut buf).ok()?;
    if buf != [0xFF, 0xD8] {
        return None;
    }
    
    let mut exif_tiff_start: Option<u64> = None;
    
    // Parse JPEG markers
    loop {
        let mut marker_prefix = [0u8; 1];
        if file.read_exact(&mut marker_prefix).is_err() {
            break;
        }
        if marker_prefix[0] != 0xFF {
            continue;
        }
        
        let mut marker_type = [0u8; 1];
        if file.read_exact(&mut marker_type).is_err() {
            break;
        }
        
        let m = marker_type[0];
        if m == 0xD9 || m == 0xDA { // EOI or Start of Scan
            break;
        }
        
        if m == 0x00 || m == 0xFF {
            continue;
        }
        
        let mut len_bytes = [0u8; 2];
        if file.read_exact(&mut len_bytes).is_err() {
            break;
        }
        let len = u16::from_be_bytes(len_bytes) as i64;
        
        if m == 0xE1 { // APP1
            let mut header = [0u8; 6];
            if file.read_exact(&mut header).is_ok() && &header == b"Exif\0\0" {
                exif_tiff_start = file.stream_position().ok();
                break;
            }
            let _ = file.seek(SeekFrom::Current(len - 2 - 6));
        } else {
            let _ = file.seek(SeekFrom::Current(len - 2));
        }
    }
    
    let tiff_start = exif_tiff_start?;
    
    let _ = file.seek(SeekFrom::Start(0));
    let mut bufreader = BufReader::new(&file);
    let exif = exif::Reader::new().read_from_container(&mut bufreader).ok()?;
    
    if let (Some(offset_field), Some(len_field)) = (
        exif.get_field(exif::Tag::JPEGInterchangeFormat, exif::In::THUMBNAIL),
        exif.get_field(exif::Tag::JPEGInterchangeFormatLength, exif::In::THUMBNAIL)
    ) {
        let offset = offset_field.value.get_uint(0)? as u64;
        let length = len_field.value.get_uint(0)? as usize;
        
        let mut thumb_bytes = vec![0u8; length];
        let _ = file.seek(SeekFrom::Start(tiff_start + offset));
        file.read_exact(&mut thumb_bytes).ok()?;
        return Some(thumb_bytes);
    }
    
    None
}
