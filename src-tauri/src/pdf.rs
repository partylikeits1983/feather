//! Generate a paginated PDF using the installed WebView, without a print dialog.
use std::path::PathBuf;
use tauri::WebviewWindow;
use tokio::sync::oneshot;

pub async fn render(window: &WebviewWindow, path: PathBuf) -> Result<(), String> {
    let (send, receive) = oneshot::channel();
    window
        .with_webview(move |webview| render_native(webview, path, send))
        .map_err(|e| e.to_string())?;
    receive
        .await
        .map_err(|_| "PDF renderer stopped unexpectedly".to_string())?
}

type Completion = oneshot::Sender<Result<(), String>>;

#[cfg(target_os = "macos")]
mod mac {
    use super::Completion;
    use objc2::{define_class, rc::Retained, runtime::NSObject, MainThreadOnly};
    use objc2_app_kit::NSPrintOperation;
    use objc2_foundation::NSObjectProtocol;
    use std::ffi::c_void;

    // Keep the delegate alive until AppKit finishes its asynchronous operation.
    pub type Context = (Retained<PdfCompletion>, Completion);
    define_class!(
        #[unsafe(super(NSObject))]
        #[thread_kind = MainThreadOnly]
        pub struct PdfCompletion;

        unsafe impl NSObjectProtocol for PdfCompletion {}
        impl PdfCompletion {
            #[unsafe(method(pdfOperation:finished:context:))]
            fn finished(&self, _operation: &NSPrintOperation, success: bool, context: *mut c_void) {
                // The context is created below and AppKit calls this selector exactly once.
                let (_delegate, send) = *unsafe { Box::from_raw(context.cast::<Context>()) };
                let _ = send.send(if success { Ok(()) } else { Err("Could not generate the PDF".into()) });
            }
        }
    );
}

#[cfg(target_os = "macos")]
fn render_native(webview: tauri::webview::PlatformWebview, path: PathBuf, send: Completion) {
    use objc2::{msg_send, runtime::ProtocolObject, sel, MainThreadMarker};
    use objc2_app_kit::{
        NSPrintInfo, NSPrintJobSavingURL, NSPrintSaveJob, NSPrintingPaginationMode,
    };
    use objc2_foundation::{NSCopying, NSSize, NSString, NSURL};
    // Tauri runs this closure on the main thread and owns the WKWebView throughout.
    unsafe {
        let view: &objc2_web_kit::WKWebView = &*webview.inner().cast();
        let info = NSPrintInfo::sharedPrintInfo().copy();
        info.setPaperSize(NSSize::new(595.28, 841.89));
        info.setLeftMargin(56.69);
        info.setRightMargin(56.69);
        info.setTopMargin(51.02);
        info.setBottomMargin(51.02);
        info.setHorizontallyCentered(false);
        info.setVerticallyCentered(false);
        info.setHorizontalPagination(NSPrintingPaginationMode::Fit);
        info.setJobDisposition(NSPrintSaveJob);
        info.dictionary().setObject_forKey(
            &NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy())),
            ProtocolObject::from_ref(NSPrintJobSavingURL),
        );
        let Some(window) = view.window() else {
            let _ = send.send(Err("PDF rendering view was closed".into()));
            return;
        };
        let operation = view.printOperationWithPrintInfo(&info);
        operation.setShowsPrintPanel(false);
        operation.setShowsProgressPanel(false);
        operation.setCanSpawnSeparateThread(true);
        let delegate = MainThreadMarker::new()
            .unwrap()
            .alloc::<mac::PdfCompletion>()
            .set_ivars(());
        let delegate: objc2::rc::Retained<mac::PdfCompletion> = msg_send![super(delegate), init];
        let context = Box::into_raw(Box::new((delegate, send)));
        // WKWebView needs AppKit's secondary printing thread to compute page ranges.
        // runOperation() on the main thread can report an unbounded placeholder range.
        operation.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
            &window,
            Some(&*(*context).0),
            Some(sel!(pdfOperation:finished:context:)),
            context.cast(),
        );
    }
}

#[cfg(target_os = "windows")]
fn render_native(webview: tauri::webview::PlatformWebview, path: PathBuf, send: Completion) {
    use std::{cell::RefCell, rc::Rc};
    use webview2_com::{
        Microsoft::Web::WebView2::Win32::{ICoreWebView2Environment6, ICoreWebView2_7},
        PrintToPdfCompletedHandler,
    };
    use windows::core::{Interface, HSTRING};
    let completion = Rc::new(RefCell::new(Some(send)));
    let callback_completion = completion.clone();
    let result = (|| -> windows::core::Result<()> {
        unsafe {
            let view: ICoreWebView2_7 = webview.controller().CoreWebView2()?.cast()?;
            let environment: ICoreWebView2Environment6 = webview.environment().cast()?;
            let settings = environment.CreatePrintSettings()?;
            settings.SetPageWidth(210.0 / 25.4)?;
            settings.SetPageHeight(297.0 / 25.4)?;
            settings.SetMarginLeft(20.0 / 25.4)?;
            settings.SetMarginRight(20.0 / 25.4)?;
            settings.SetMarginTop(18.0 / 25.4)?;
            settings.SetMarginBottom(18.0 / 25.4)?;
            settings.SetShouldPrintBackgrounds(true)?;
            settings.SetShouldPrintHeaderAndFooter(false)?;
            let callback = PrintToPdfCompletedHandler::create(Box::new(move |result, success| {
                if let Some(send) = callback_completion.borrow_mut().take() {
                    let result = result.map_err(|e| e.to_string()).and_then(|()| {
                        if success {
                            Ok(())
                        } else {
                            Err("Could not generate the PDF".into())
                        }
                    });
                    let _ = send.send(result);
                }
                Ok(())
            }));
            view.PrintToPdf(&HSTRING::from(path.as_os_str()), &settings, &callback)
        }
    })();
    if let Err(error) = result {
        if let Some(send) = completion.borrow_mut().take() {
            let _ = send.send(Err(error.to_string()));
        }
    }
}

#[cfg(target_os = "linux")]
fn render_native(webview: tauri::webview::PlatformWebview, path: PathBuf, send: Completion) {
    use std::{cell::RefCell, rc::Rc};
    use webkit2gtk::PrintOperationExt;
    let Ok(uri) = tauri::Url::from_file_path(&path) else {
        let _ = send.send(Err("Invalid PDF destination".into()));
        return;
    };
    let operation = webkit2gtk::PrintOperation::new(&webview.inner());
    let settings = gtk::PrintSettings::new();
    settings.set_printer("Print to File");
    settings.set("output-file-format", Some("pdf"));
    settings.set("output-uri", Some(uri.as_str()));
    operation.set_print_settings(&settings);
    let page = gtk::PageSetup::new();
    page.set_paper_size(&gtk::PaperSize::new("iso_a4"));
    page.set_left_margin(20.0, gtk::Unit::Mm);
    page.set_right_margin(20.0, gtk::Unit::Mm);
    page.set_top_margin(18.0, gtk::Unit::Mm);
    page.set_bottom_margin(18.0, gtk::Unit::Mm);
    operation.set_page_setup(&page);
    let completion = Rc::new(RefCell::new(Some(send)));
    let failed = completion.clone();
    operation.connect_failed(move |_, error| {
        if let Some(send) = failed.borrow_mut().take() {
            let _ = send.send(Err(error.to_string()));
        }
    });
    operation.connect_finished(move |_| {
        if let Some(send) = completion.borrow_mut().take() {
            let _ = send.send(Ok(()));
        }
    });
    operation.print();
}
