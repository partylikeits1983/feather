use feather_core::Workspace;
use std::{fs, time::Instant};

fn main() {
    let dir = tempfile::tempdir().unwrap();
    for size in [1024, 1024 * 1024] {
        fs::write(dir.path().join("sample.md"), "x".repeat(size)).unwrap();
        let (ws, _) = Workspace::open(dir.path()).unwrap();
        let start = Instant::now();
        for _ in 0..100 {
            std::hint::black_box(ws.read("sample.md").unwrap());
        }
        println!(
            "open {size} bytes: {:.3} ms (100-run mean)",
            start.elapsed().as_secs_f64() * 10.0
        );
    }
    for n in 0..10_000 {
        fs::write(dir.path().join(format!("{n}.md")), "# Note").unwrap();
    }
    let (ws, _) = Workspace::open(dir.path()).unwrap();
    let start = Instant::now();
    let entries = ws.list("").unwrap();
    println!(
        "list {} files: {:.3} ms",
        entries.len(),
        start.elapsed().as_secs_f64() * 1000.0
    );
}
