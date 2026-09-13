pub mod document;
pub mod filesystem;
pub mod git;
pub mod latex;
pub mod watcher;
pub mod workspace;

pub use document::Document;
pub use workspace::{Entry, Workspace};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("This path is outside the opened folder")]
    OutsideWorkspace,
    #[error("CONFLICT: This file changed outside Feather. Review the disk version before saving.")]
    Conflict,
    #[error("{0}")]
    Message(String),
}
pub type Result<T> = std::result::Result<T, Error>;
