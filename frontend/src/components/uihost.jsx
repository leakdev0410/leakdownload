import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from './icons.jsx';
import { Dialog } from './components.jsx';
import { subscribe, getUiState, dismissToast, resolveConfirm } from '../ui.js';

const TOAST_ICON = { error: "alert", success: "check", info: "info" };

function ToastItem({ t }) {
  const [paused, setPaused] = useState(false);
  const timer = useRef(0);
  const ttl = t.kind === "error" ? 8000 : 4500;

  // Tự đóng; tạm dừng khi hover/focus hoặc tab ẩn.
  useEffect(() => {
    if (paused) return undefined;
    timer.current = setTimeout(() => dismissToast(t.id), ttl);
    return () => clearTimeout(timer.current);
  }, [paused, t.id, ttl]);

  return (
    <div
      className={"toast toast-" + t.kind}
      role={t.kind === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="toast-ico"><Icon name={TOAST_ICON[t.kind] || "info"} size={16} /></span>
      <span className="toast-msg">{t.message}</span>
      <button type="button" className="ibtn sm" aria-label="Đóng thông báo" onClick={() => dismissToast(t.id)}>
        <Icon name="close" size={13} />
      </button>
    </div>
  );
}

function ConfirmDialog({ c }) {
  return (
    <Dialog className="dlg-sm" labelledBy="confirm-title" onClose={() => resolveConfirm(false)}>
      <div className="modal-body confirm-body">
        <h3 id="confirm-title" className="confirm-title">{c.title}</h3>
        {c.message && <p className="confirm-msg">{c.message}</p>}
      </div>
      <footer className="modal-foot">
        <button type="button" className="btn ghost" onClick={() => resolveConfirm(false)}>Hủy</button>
        <button
          type="button"
          className={"btn " + (c.danger ? "danger" : "primary")}
          autoFocus
          onClick={() => resolveConfirm(true)}
        >
          {c.confirmLabel}
        </button>
      </footer>
    </Dialog>
  );
}

/** Toast region (luôn mounted → live region) + confirm dialog. */
function UiHost() {
  const ui = useSyncExternalStore(subscribe, getUiState, getUiState);
  const hostRef = useRef(null);
  const count = ui.toasts.length;

  // Toast nằm trong top layer (popover) để không bị dialog modal che.
  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof el.showPopover !== "function") return;
    try {
      if (el.matches(":popover-open")) el.hidePopover();
      if (count > 0) el.showPopover(); // gọi lại → đẩy lên trên cùng top layer
    } catch { /* ignore */ }
  }, [count, ui.confirm]);

  return (
    <>
      <div ref={hostRef} className="toasts" popover="manual" aria-live="polite" aria-label="Thông báo">
        {ui.toasts.map((t) => <ToastItem key={t.id} t={t} />)}
      </div>
      {ui.confirm && <ConfirmDialog c={ui.confirm} />}
    </>
  );
}

export { UiHost };
