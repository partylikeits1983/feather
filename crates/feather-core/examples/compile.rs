fn main() {
    let path = std::env::args().nth(1).expect("Usage: compile FILE.tex");
    let (workspace, selected) = feather_core::Workspace::open(path).unwrap();
    let path = selected.unwrap();
    let document = workspace.read(&path).unwrap();
    match feather_core::latex::compile(&workspace, &path, &document.contents) {
        Ok(result) => {
            println!("{}", result.log);
            if let Some(pdf) = result.pdf {
                println!("PDF produced: {} base64 bytes", pdf.len());
            } else {
                std::process::exit(1);
            }
        }
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
