use crate::{Error, Result};
use serde::Serialize;
use std::{
    fs,
    path::{Component, Path, PathBuf},
};

#[derive(Debug, Clone)]
pub struct Workspace {
    pub root: PathBuf,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Serialize)]
pub struct SearchResults {
    pub paths: Vec<String>,
    pub truncated: bool,
}

impl Workspace {
    pub fn open(path: impl AsRef<Path>) -> Result<(Self, Option<String>)> {
        let path = path.as_ref().canonicalize()?;
        let (root, selected) = if path.is_file() {
            (
                path.parent().ok_or(Error::OutsideWorkspace)?.to_path_buf(),
                Some(path.file_name().unwrap().to_string_lossy().into_owned()),
            )
        } else if path.is_dir() {
            (path, None)
        } else {
            return Err(Error::Message("Choose a file or folder".into()));
        };
        Ok((Self { root }, selected))
    }

    // Validate lexical components first, then resolve symlinks before every access.
    pub fn resolve(&self, relative: &str) -> Result<PathBuf> {
        let path = Path::new(relative);
        if path
            .components()
            .any(|c| !matches!(c, Component::Normal(_) | Component::CurDir))
        {
            return Err(Error::OutsideWorkspace);
        }
        let candidate = self.root.join(path);
        let canonical = candidate.canonicalize()?;
        if !canonical.starts_with(&self.root) {
            return Err(Error::OutsideWorkspace);
        }
        Ok(canonical)
    }

    pub fn destination(&self, relative: &str) -> Result<PathBuf> {
        let path = Path::new(relative);
        if path
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
            || relative.is_empty()
        {
            return Err(Error::OutsideWorkspace);
        }
        let name = path.file_name().ok_or(Error::OutsideWorkspace)?;
        let parent = self.resolve(
            path.parent()
                .unwrap_or(Path::new(""))
                .to_str()
                .ok_or(Error::OutsideWorkspace)?,
        )?;
        let dest = parent.join(name);
        if dest.symlink_metadata().is_ok() {
            return Err(Error::Message(
                "A file or folder already has that name".into(),
            ));
        }
        Ok(dest)
    }

    pub fn list(&self, relative: &str) -> Result<Vec<Entry>> {
        let directory = self.resolve(relative)?;
        let mut entries = Vec::new();
        for item in fs::read_dir(directory)? {
            let item = item?;
            let name = item.file_name().to_string_lossy().into_owned();
            if name == ".git" || name == ".DS_Store" || name.starts_with(".feather-") {
                continue;
            }
            let kind = item.file_type()?;
            // Do not follow tree symlinks: avoids loops and ambiguous mutation targets.
            if kind.is_symlink() {
                continue;
            }
            entries.push(Entry {
                name,
                path: item
                    .path()
                    .strip_prefix(&self.root)
                    .map_err(|_| Error::OutsideWorkspace)?
                    .to_string_lossy()
                    .replace('\\', "/"),
                is_dir: kind.is_dir(),
            });
        }
        entries.sort_by(|a, b| {
            b.is_dir
                .cmp(&a.is_dir)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        Ok(entries)
    }

    pub fn search(&self, query: &str) -> Result<SearchResults> {
        let query = query.to_lowercase();
        let mut stack = vec![String::new()];
        let mut paths = Vec::new();
        let mut seen = 0;
        let mut truncated = false;
        while let Some(dir) = stack.pop() {
            for entry in self.list(&dir)? {
                seen += 1;
                if seen > 50_000 || paths.len() >= 200 {
                    truncated = true;
                    break;
                }
                if entry.is_dir {
                    if !entry.name.starts_with('.')
                        && !matches!(entry.name.as_str(), "node_modules" | "target" | "dist")
                    {
                        stack.push(entry.path);
                    }
                } else if entry.path.to_lowercase().contains(&query) {
                    paths.push(entry.path);
                }
            }
            if truncated {
                break;
            }
        }
        paths.sort();
        Ok(SearchResults { paths, truncated })
    }

    pub fn create(&self, relative: &str, directory: bool) -> Result<()> {
        let path = self.destination(relative)?;
        if directory {
            fs::create_dir(path)?;
        } else {
            fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(path)?
                .sync_all()?;
        }
        Ok(())
    }

    pub fn rename(&self, from: &str, to: &str) -> Result<()> {
        let source = self.resolve(from)?;
        if source == self.root {
            return Err(Error::OutsideWorkspace);
        }
        fs::rename(source, self.destination(to)?)?;
        Ok(())
    }

    pub fn duplicate(&self, from: &str, to: &str) -> Result<()> {
        let source = self.resolve(from)?;
        if !source.is_file() {
            return Err(Error::Message("Duplicate is available for files".into()));
        }
        let mut input = fs::File::open(source)?;
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(self.destination(to)?)?;
        std::io::copy(&mut input, &mut output)?;
        output.sync_all()?;
        Ok(())
    }

    pub fn trash(&self, relative: &str) -> Result<()> {
        let path = self.resolve(relative)?;
        if path == self.root {
            return Err(Error::OutsideWorkspace);
        }
        trash::delete(path).map_err(|e| Error::Message(format!("Could not move to trash: {e}")))
    }
}
