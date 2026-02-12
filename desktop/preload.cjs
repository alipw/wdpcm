const { contextBridge } = require('electron');

const apiBaseUrl = process.env.WDPCM_RENDERER_API_URL ?? 'http://127.0.0.1:7589';
const socketUrl = process.env.WDPCM_RENDERER_SOCKET_URL ?? 'http://127.0.0.1:7590';

contextBridge.exposeInMainWorld('wdpcmDesktopConfig', {
  apiBaseUrl,
  socketUrl
});
