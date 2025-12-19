import { Worker } from 'worker_threads'
import * as path from 'path'
import * as fs from 'fs'
import { IndexProgress } from '../shared/types'

type ProgressCallback = (progress: IndexProgress) => void

export class Indexer {
  private indexDir: string
  private onProgress: ProgressCallback
  private workers: Map<string, Worker> = new Map()

  constructor(userDataPath: string, onProgress: ProgressCallback) {
    this.indexDir = path.join(userDataPath, 'indexes')
    this.onProgress = onProgress
    if (!fs.existsSync(this.indexDir)) {
      fs.mkdirSync(this.indexDir, { recursive: true })
    }
  }

  cancel(fileId: string) {
    const worker = this.workers.get(fileId)
    if (worker) {
      worker.terminate()
      this.workers.delete(fileId)
      this.emitProgress(fileId, 'cancelled', 0, 0, 0)
    }
  }

  async indexFile(filePath: string, fileId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.emitProgress(fileId, 'indexing', 0, 0, 0)

      // Get the worker script path
      const workerPath = path.join(__dirname, 'indexer-worker.js')

      const worker = new Worker(workerPath, {
        workerData: {
          filePath,
          fileId,
          indexDir: this.indexDir,
        },
      })

      this.workers.set(fileId, worker)

      worker.on('message', (msg) => {
        if (msg.type === 'progress') {
          this.emitProgress(fileId, 'indexing', msg.percent, msg.recordsProcessed, msg.eta)
        } else if (msg.type === 'complete') {
          this.workers.delete(fileId)
          this.emitProgress(fileId, 'complete', 100, msg.totalRecords, 0)
          resolve()
        } else if (msg.type === 'error') {
          this.workers.delete(fileId)
          this.emitProgress(fileId, 'error', 0, 0, 0, msg.error)
          reject(new Error(msg.error))
        }
      })

      worker.on('error', (error) => {
        this.workers.delete(fileId)
        this.emitProgress(fileId, 'error', 0, 0, 0, error.message)
        reject(error)
      })

      worker.on('exit', (code) => {
        this.workers.delete(fileId)
        if (code !== 0) {
          reject(new Error(`Worker exited with code ${code}`))
        }
      })
    })
  }

  private emitProgress(
    fileId: string,
    status: IndexProgress['status'],
    percent: number,
    records: number,
    eta: number,
    error?: string
  ) {
    this.onProgress({
      fileId,
      percent,
      recordsProcessed: records,
      totalEstimate: 0,
      eta,
      status,
      error,
    })
  }
}
