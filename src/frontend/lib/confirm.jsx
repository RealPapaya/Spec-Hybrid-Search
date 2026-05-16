// confirm.jsx — themed modal to replace window.confirm().
// Exposes a global ConfirmDialogProvider wrapper and useConfirm() hook.
//
// Usage inside any component (must be under ConfirmDialogProvider):
//   const confirm = useConfirm();
//   const ok = await confirm('Delete this tag?', { danger: true });
//   if (!ok) return;
//
// opts: { title, confirmLabel, cancelLabel, danger, actions }

var ConfirmCtx = React.createContext(null);

function ConfirmDialogProvider({ children }) {
  const [state, setState] = React.useState(null);
  // state = { message, title, confirmLabel, cancelLabel, danger, actions, resolve }

  const confirm = React.useCallback((message, opts = {}) => {
    return new Promise(resolve => {
      setState({ message, resolve, ...opts });
    });
  }, []);

  const handleClose = (result) => {
    if (state) state.resolve(result);
    setState(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <ConfirmDialogModal
          title={state.title}
          message={state.message}
          confirmLabel={state.confirmLabel}
          cancelLabel={state.cancelLabel}
          danger={state.danger}
          actions={state.actions}
          onConfirm={() => handleClose(true)}
          onCancel={() => handleClose(false)}
          onAction={handleClose}
        />
      )}
    </ConfirmCtx.Provider>
  );
}

function useConfirm() {
  const ctx = React.useContext(ConfirmCtx);
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmDialogProvider');
  return ctx;
}

function ConfirmDialogModal({ title, message, confirmLabel, cancelLabel, danger, actions, onConfirm, onCancel, onAction }) {
  const T = useT();

  // Close on Escape key
  React.useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  return ReactDOM.createPortal(
    <div className="confirm-backdrop" onClick={onCancel}>
      <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
        {title && <div className="confirm-title">{title}</div>}
        <div className="confirm-message">{message}</div>
        {Array.isArray(actions) && actions.length ? (
          <div className="confirm-actions">
            {actions.map((action, idx) => (
              <button
                key={idx}
                className={
                  'confirm-btn ' +
                  (action.danger ? 'confirm-btn-danger' : action.cancel ? 'confirm-btn-cancel' : 'confirm-btn-ok')
                }
                onClick={() => onAction(action.value)}
                autoFocus={idx === 0}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="confirm-actions">
            <button className="confirm-btn confirm-btn-cancel" onClick={onCancel}>
              {cancelLabel || T('confirm_cancel')}
            </button>
            <button
              className={'confirm-btn' + (danger ? ' confirm-btn-danger' : ' confirm-btn-ok')}
              onClick={onConfirm}
              autoFocus
            >
              {confirmLabel || (danger ? T('confirm_danger') : T('confirm_ok'))}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
