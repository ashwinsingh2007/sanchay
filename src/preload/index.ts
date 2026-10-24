import { contextBridge, ipcRenderer } from 'electron'
import type { CfoApi, IpcResult } from '../shared/ipc'
import { AI_EVENT_CHANNEL, API_METHODS, IPC_PREFIX } from '../shared/ipcChannels'

/**
 * The only bridge between the UI and the main process. It exposes a fixed list of typed methods;
 * no Node.js, filesystem or raw IPC access is available to the renderer.
 */
const api = Object.fromEntries(
  API_METHODS.map((method) => [
    method,
    async (input?: unknown) => {
      const result = (await ipcRenderer.invoke(
        `${IPC_PREFIX}${method}`,
        input
      )) as IpcResult<unknown>
      if (!result.ok) throw new Error(result.error)
      return result.data
    }
  ])
) as unknown as CfoApi

contextBridge.exposeInMainWorld('cfo', api)
contextBridge.exposeInMainWorld('cfoPlatform', { platform: process.platform })

/** Subscribe to streamed AI output / model download progress. Returns an unsubscribe function. */
contextBridge.exposeInMainWorld('cfoEvents', {
  onAi(callback: (event: unknown) => void): () => void {
    const listener = (_e: Electron.IpcRendererEvent, payload: unknown): void => callback(payload)
    ipcRenderer.on(AI_EVENT_CHANNEL, listener)
    return () => ipcRenderer.removeListener(AI_EVENT_CHANNEL, listener)
  }
})
