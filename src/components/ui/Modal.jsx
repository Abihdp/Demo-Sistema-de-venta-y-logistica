// Wrapper genérico de modal con overlay

export const Modal = ({ onClose, children, size="modal-md" }) => (
  <div className="modal-bg" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className={`modal ${size}`}>{children}</div>
  </div>
);


export default Modal;
