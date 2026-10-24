import type { CfoApi } from '../shared/ipc'
import type { AiEvent } from '../shared/types'

declare global {
  interface Window {
    cfo: CfoApi
    cfoPlatform: { platform: string }
    cfoEvents: { onAi(callback: (event: AiEvent) => void): () => void }
  }
}

export {}
