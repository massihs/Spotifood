// Bridge between this PC's own screens (bar, setup, local hub pages) and the app.
// The website only gets the card terminal: send an amount, read the result (the app checks that
// the request comes from the restaurant's own site).
const { contextBridge, ipcRenderer } = require("electron");

const local = /^http:\/\/127\.0\.0\.1:\d+$/.test(location.origin);
if (local) {
  contextBridge.exposeInMainWorld("spotifood", {
    state: () => ipcRenderer.invoke("state"),
    action: (name, arg) => ipcRenderer.invoke("action", name, arg),
    onState: (fn) => ipcRenderer.on("state", (_e, s) => fn(s)),
  });
} else {
  contextBridge.exposeInMainWorld("spotifoodTerminal", {
    info: () => ipcRenderer.invoke("terminal", "info"),
    pay: (req) => ipcRenderer.invoke("terminal", "pay", req),
    cancel: () => ipcRenderer.invoke("terminal", "cancel"),
  });
}
