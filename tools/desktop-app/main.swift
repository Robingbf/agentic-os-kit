// Desktop app for the agentic OS (macOS): shows the local dashboard in its own window (WKWebView),
// starts the dashboard server when it is not running, opens external links in the default browser.
import Cocoa
import WebKit

let info = Bundle.main.infoDictionary ?? [:]
let osRoot = info["OSRoot"] as? String ?? (NSHomeDirectory() + "/agentic-os")
let appName = info["CFBundleName"] as? String ?? "Agentic OS"
let port = info["OSPort"] as? String ?? "8765"
let base = URL(string: "http://127.0.0.1:\(port)/")!

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var web: WKWebView!

    func applicationDidFinishLaunching(_ note: Notification) {
        buildMenu()
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .default()                   // keeps localStorage (layout, preferences) between launches
        cfg.userContentController.add(self, name: "osApp")  // "▶ start" button of the dashboard
        web = WKWebView(frame: .zero, configuration: cfg)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.setValue(false, forKey: "drawsBackground")
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1500, height: 940),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = appName
        window.titlebarAppearsTransparent = true
        window.backgroundColor = NSColor(red: 0.04, green: 0.047, blue: 0.06, alpha: 1)
        window.appearance = NSAppearance(named: .darkAqua)
        window.contentView = web
        window.minSize = NSSize(width: 900, height: 600)
        window.center()
        window.setFrameAutosaveName("OSMainWindow")
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        web.loadHTMLString(splash("Starting the dashboard…"), baseURL: nil)
        DispatchQueue.global().async { self.ensureServerThenLoad() }
    }

    func applicationShouldHandleReopen(_ app: NSApplication, hasVisibleWindows: Bool) -> Bool {
        if !hasVisibleWindows { window.makeKeyAndOrderFront(nil) }
        return true
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        if (message.body as? String) == "startServer" { DispatchQueue.global().async { self.ensureServerThenLoad() } }
    }

    // --- server ---
    func healthy() -> Bool {
        var req = URLRequest(url: base.appendingPathComponent("health"))
        req.timeoutInterval = 1
        let sem = DispatchSemaphore(value: 0)
        var ok = false
        URLSession.shared.dataTask(with: req) { _, resp, _ in ok = (resp as? HTTPURLResponse)?.statusCode == 200; sem.signal() }.resume()
        _ = sem.wait(timeout: .now() + 2)
        return ok
    }

    func python() -> String {
        for p in ["/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/usr/bin/python3"] where FileManager.default.isExecutableFile(atPath: p) { return p }
        return "/usr/bin/python3"
    }

    func ensureServerThenLoad() {
        if !healthy() {
            let p = Process()
            p.executableURL = URL(fileURLWithPath: python())
            p.arguments = [osRoot + "/dashboard/server.py"]
            p.currentDirectoryURL = URL(fileURLWithPath: osRoot)
            try? FileManager.default.createDirectory(atPath: osRoot + "/state", withIntermediateDirectories: true)
            let logPath = osRoot + "/state/desktop-server.log"
            FileManager.default.createFile(atPath: logPath, contents: nil)
            if let log = FileHandle(forWritingAtPath: logPath) { p.standardOutput = log; p.standardError = log }
            do { try p.run() } catch {
                DispatchQueue.main.async { self.web.loadHTMLString(self.splash("Could not start the server: \(error.localizedDescription)"), baseURL: nil) }
                return
            }
            for _ in 0..<40 { if healthy() { break }; Thread.sleep(forTimeInterval: 0.25) }
        }
        DispatchQueue.main.async {
            if self.healthy() { self.web.load(URLRequest(url: base)) }
            else { self.web.loadHTMLString(self.splash("The server does not answer. Log: state/desktop-server.log — ⌘R to retry."), baseURL: nil) }
        }
    }

    func splash(_ text: String) -> String {
        "<html><body style='margin:0;height:100vh;display:grid;place-items:center;background:#0a0c0f;color:#77746d;font:12px ui-monospace,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase'>\(text)</body></html>"
    }

    @objc func reload(_ sender: Any?) {
        if web.url?.host == "127.0.0.1" { web.reload() } else { DispatchQueue.global().async { self.ensureServerThenLoad() } }
    }

    // --- links: anything that is not the dashboard opens in the default browser ---
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.allow) }
        if url.scheme == "about" || url.scheme == "data" || (url.host == "127.0.0.1" && url.port == Int(port)) { return decisionHandler(.allow) }
        NSWorkspace.shared.open(url)
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { NSWorkspace.shared.open(url) }
        return nil
    }

    // --- JavaScript dialogs ---
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert(); a.messageText = message; a.runModal(); completionHandler()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert(); a.messageText = message; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
        completionHandler(a.runModal() == .alertFirstButtonReturn)
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let p = NSOpenPanel(); p.allowsMultipleSelection = parameters.allowsMultipleSelection
        completionHandler(p.runModal() == .OK ? p.urls : nil)
    }

    // --- menus (needed for ⌘C / ⌘V / ⌘R inside the page) ---
    func buildMenu() {
        let main = NSMenu()
        func sub(_ title: String, _ items: [NSMenuItem]) {
            let it = NSMenuItem(); let m = NSMenu(title: title); items.forEach { m.addItem($0) }; it.submenu = m; main.addItem(it)
        }
        func item(_ t: String, _ a: Selector?, _ k: String, _ mods: NSEvent.ModifierFlags = .command) -> NSMenuItem {
            let i = NSMenuItem(title: t, action: a, keyEquivalent: k); i.keyEquivalentModifierMask = mods; return i
        }
        sub(appName, [item("Hide \(appName)", #selector(NSApplication.hide(_:)), "h"), .separator(),
                      item("Quit \(appName)", #selector(NSApplication.terminate(_:)), "q")])
        sub("Edit", [item("Undo", Selector(("undo:")), "z"), item("Redo", Selector(("redo:")), "z", [.command, .shift]), .separator(),
                     item("Cut", #selector(NSText.cut(_:)), "x"), item("Copy", #selector(NSText.copy(_:)), "c"),
                     item("Paste", #selector(NSText.paste(_:)), "v"), item("Select All", #selector(NSText.selectAll(_:)), "a")])
        let rl = item("Reload", #selector(reload(_:)), "r"); rl.target = self
        sub("View", [rl, item("Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control])])
        sub("Window", [item("Minimize", #selector(NSWindow.miniaturize(_:)), "m"), item("Close", #selector(NSWindow.performClose(_:)), "w")])
        NSApp.mainMenu = main
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
