import Modal from './Modal'

/** La versión sale de package.json (la mete Vite al compilar). */
declare const __APP_VERSION__: string

export default function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Acerca de ShinNoberu" onClose={onClose} className="about-dialog">
      <div className="about-body">
        <img className="about-logo" src="/shinnoberu-te-verde.svg" alt="ShinNoberu 新ノベル" />
        <p className="about-tagline">Editor de EPUB para maquetar novelas</p>
        <p className="hint">Versión {__APP_VERSION__}</p>
        <p className="hint about-credits">
          Hecho con Tauri, React y CodeMirror. Diccionario español de LibreOffice (RLA-ES), con
          licencia GPL, LGPL o MPL.
        </p>
      </div>
      <footer>
        <span className="hint" />
        <button className="primary" onClick={onClose}>Cerrar</button>
      </footer>
    </Modal>
  )
}
