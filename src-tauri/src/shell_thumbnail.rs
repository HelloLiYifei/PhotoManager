//! Windows Explorer thumbnail-cache integration.
//!
//! `IThumbnailCache` is the cache used by the Windows Shell.  Reading it
//! before touching the source file is especially valuable for SD cards: a
//! cache hit avoids a slow removable-media read entirely.  When the cache has
//! no entry, `WTS_FASTEXTRACT` delegates decoding to the same native thumbnail
//! providers used by Explorer (including installed RAW codecs).

use std::path::Path;

#[cfg(target_os = "windows")]
use image::{DynamicImage, ImageBuffer, Rgba};

/// Load a display-ready thumbnail through the native Windows Shell cache.
///
/// Returns `None` on cache/provider failure so callers can use the portable
/// image/EXIF fallback without making thumbnail loading platform-dependent.
#[cfg(target_os = "windows")]
pub fn load(path: &Path, requested_size: u32) -> Option<DynamicImage> {
    use std::os::windows::ffi::OsStrExt;

    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{
        GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
        DIB_RGB_COLORS, HBITMAP,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_MULTITHREADED,
    };
    use windows::Win32::UI::Shell::{
        ISharedBitmap, IShellItem, IThumbnailCache, LocalThumbnailCache,
        SHCreateItemFromParsingName, WTS_FASTEXTRACT, WTS_INCACHEONLY, WTS_SCALETOREQUESTEDSIZE,
    };

    unsafe fn hbitmap_to_image(hbitmap: HBITMAP) -> Option<DynamicImage> {
        if hbitmap.0 == 0 {
            return None;
        }

        let mut bitmap = BITMAP::default();
        if GetObjectW(
            hbitmap,
            std::mem::size_of::<BITMAP>() as i32,
            Some((&mut bitmap as *mut BITMAP).cast()),
        ) == 0
        {
            return None;
        }

        let width = bitmap.bmWidth;
        let height = bitmap.bmHeight.checked_abs()?;
        if width <= 0 || height <= 0 {
            return None;
        }

        let pixel_len = (width as usize)
            .checked_mul(height as usize)?
            .checked_mul(4)?;
        let mut pixels = vec![0u8; pixel_len];
        let mut info = BITMAPINFO::default();
        info.bmiHeader = BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            // A negative height requests a top-down buffer, matching `image`.
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        };

        let desktop = GetDC(HWND(0));
        if desktop.0 == 0 {
            return None;
        }
        let copied = GetDIBits(
            desktop,
            hbitmap,
            0,
            height as u32,
            Some(pixels.as_mut_ptr().cast()),
            &mut info,
            DIB_RGB_COLORS,
        );
        ReleaseDC(HWND(0), desktop);
        if copied == 0 {
            return None;
        }

        // GDI returns BGRA; the `image` buffer is RGBA.
        for pixel in pixels.chunks_exact_mut(4) {
            pixel.swap(0, 2);
        }
        ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(width as u32, height as u32, pixels)
            .map(DynamicImage::ImageRgba8)
    }

    // `spawn_blocking` threads can be reused.  Initializing MTA on every call
    // is valid; only balance the successful initializations on this thread.
    let should_uninitialize = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).is_ok() };
    let result = (|| unsafe {
        let mut wide_path: Vec<u16> = path.as_os_str().encode_wide().collect();
        wide_path.push(0);
        let path = PCWSTR(wide_path.as_ptr());

        let shell_item: IShellItem = SHCreateItemFromParsingName(path, None).ok()?;
        let cache: IThumbnailCache =
            CoCreateInstance(&LocalThumbnailCache, None, CLSCTX_INPROC_SERVER).ok()?;

        let read_thumbnail = |flags| -> Option<DynamicImage> {
            let mut shared: Option<ISharedBitmap> = None;
            cache
                .GetThumbnail(
                    &shell_item,
                    requested_size,
                    flags | WTS_SCALETOREQUESTEDSIZE,
                    Some(&mut shared),
                    None,
                    None,
                )
                .ok()?;

            // The shared bitmap is owned by the Shell cache.  Copy its pixels
            // before dropping the COM object; do not call DeleteObject here.
            let hbitmap = shared?.GetSharedBitmap().ok()?;
            hbitmap_to_image(hbitmap)
        };

        // Cache-only is the latency-critical path: no source-file I/O occurs.
        read_thumbnail(WTS_INCACHEONLY)
            // On a miss, ask the Shell for its quickest native provider path.
            .or_else(|| read_thumbnail(WTS_FASTEXTRACT))
    })();

    if should_uninitialize {
        unsafe { CoUninitialize() };
    }
    result
}

#[cfg(not(target_os = "windows"))]
pub fn load(_path: &Path, _requested_size: u32) -> Option<image::DynamicImage> {
    None
}
