use crate::{Error, Result, Workspace};
use serde::Serialize;
use std::{
    fs,
    io::{Read, Write},
};

pub const MAX_DOCUMENT_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Debug, Serialize)]
pub struct Document {
    pub path: String,
    pub contents: String,
    pub version: String,
}

pub fn fingerprint(bytes: &[u8]) -> String {
    blake3::hash(bytes).to_hex().to_string()
}

fn read_bytes(path: &std::path::Path) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    fs::File::open(path)?
        .take(MAX_DOCUMENT_BYTES + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_DOCUMENT_BYTES {
        return Err(Error::Message(
            "This document exceeds the 32 MB editing limit".into(),
        ));
    }
    Ok(bytes)
}

impl Workspace {
    pub fn read(&self, relative: &str) -> Result<Document> {
        let path = self.resolve(relative)?;
        if !crate::workspace::editable(&path) {
            return Err(Error::Message(
                "This file is not a supported text document".into(),
            ));
        }
        let bytes = read_bytes(&path)?;
        let version = fingerprint(&bytes);
        let contents = String::from_utf8(bytes)
            .map_err(|_| Error::Message("This file is not UTF-8 text".into()))?;
        Ok(Document {
            path: relative.into(),
            contents: contents
                .trim_start_matches('\u{feff}')
                .replace("\r\n", "\n"),
            version,
        })
    }

    pub fn save(&self, relative: &str, contents: &str, expected_version: &str) -> Result<String> {
        if contents.len() as u64 > MAX_DOCUMENT_BYTES {
            return Err(Error::Message(
                "This document exceeds the 32 MB editing limit".into(),
            ));
        }
        let path = self.resolve(relative).map_err(|e| match e {
            Error::Io(ref io) if io.kind() == std::io::ErrorKind::NotFound => Error::Conflict,
            other => other,
        })?;
        let old = read_bytes(&path)?;
        if fingerprint(&old) != expected_version {
            return Err(Error::Conflict);
        }
        let crlf = old.windows(2).any(|w| w == b"\r\n");
        let normalized = contents.replace("\r\n", "\n");
        let mut data = if crlf {
            normalized.replace('\n', "\r\n").into_bytes()
        } else {
            normalized.into_bytes()
        };
        if old.starts_with(&[0xef, 0xbb, 0xbf]) {
            data.splice(0..0, [0xef, 0xbb, 0xbf]);
        }
        let mut temp = tempfile::Builder::new()
            .prefix(".feather-")
            .tempfile_in(path.parent().ok_or(Error::OutsideWorkspace)?)?;
        temp.as_file()
            .set_permissions(fs::metadata(&path)?.permissions())?;
        temp.write_all(&data)?;
        temp.as_file().sync_all()?;
        // Recheck after writing the temporary file to narrow the outside-writer race.
        if fingerprint(&read_bytes(&path)?) != expected_version {
            return Err(Error::Conflict);
        }
        temp.persist(&path).map_err(|e| Error::Io(e.error))?;
        #[cfg(unix)]
        fs::File::open(path.parent().unwrap())?.sync_all()?;
        Ok(fingerprint(&data))
    }
}
