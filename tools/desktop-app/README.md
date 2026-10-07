# Desktop app

Your OS as a real app: its own window and icon (the brain hexagon in your accent colour), no browser tabs.
It **starts the dashboard server by itself** when it is not running, and the dashboard shows a **▶ start**
button top-left whenever the server is off.

| System | Command | Result |
|---|---|---|
| macOS | `bash tools/desktop-app/build.sh` | `~/Applications/<OS name>.app` (needs `xcode-select --install`) |
| Linux | `bash tools/desktop-app/linux.sh` | an entry in your applications menu |
| Any (no build) | `bash tools/desktop-app/launch.sh` | starts the server if needed and opens the dashboard in an app-style browser window |

Rebuild the macOS app after changing the OS name, the accent colour or the port in `os.config.json`.
Links to other sites open in your default browser. Uninstall: delete the `.app` (or the `.desktop` file).
