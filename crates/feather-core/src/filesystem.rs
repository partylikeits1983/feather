use crate::{Error, Result, Workspace};
use base64::Engine;
use std::fs;

impl Workspace {
    pub fn image(&self, relative: &str) -> Result<String> {
        let path = self.resolve(relative)?;
        let mime = match path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase()
            .as_str()
        {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "svg" => "image/svg+xml",
            "avif" => "image/avif",
            _ => return Err(Error::Message("Unsupported image format".into())),
        };
        if fs::metadata(&path)?.len() > 10 * 1024 * 1024 {
            return Err(Error::Message("Image exceeds 10 MB".into()));
        }
        Ok(format!(
            "data:{mime};base64,{}",
            base64::engine::general_purpose::STANDARD.encode(fs::read(path)?)
        ))
    }
}
