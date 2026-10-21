// IndexedDB compartido por el borrador automático y los puntos de control.
//
// Van juntos a propósito: si cada uno abriera la base con su versión, el que
// usara la menor fallaría con VersionError en cuanto el otro la subiera.

const DB_NAME = 'epub-editor'
const VERSION = 3

export const DRAFTS = 'drafts'
export const CHECKPOINTS = 'checkpoints'
export const RECENTS = 'recents'

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      for (const name of [DRAFTS, CHECKPOINTS, RECENTS]) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function run<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    db =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const req = fn(tx.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
        tx.oncomplete = () => db.close()
      }),
  )
}
