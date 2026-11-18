// ui.js — tiny global store for toasts + confirm dialogs (replaces alert/confirm).
// Rendered by <UiHost /> (components/uihost.jsx). Safe to call from anywhere.

let state = { toasts: [], confirm: null };
let nextId = 1;
const subs = new Set();

function set(next) {
  state = next;
  subs.forEach((fn) => fn());
}

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function getUiState() {
  return state;
}

/** Hiển thị toast. kind: "error" | "info" | "success". */
export function toast(message, kind = "error") {
  const text = message == null ? "" : String(message);
  if (!text) return;
  // Gộp toast trùng nội dung đang hiển thị.
  if (state.toasts.some((t) => t.message === text && t.kind === kind)) return;
  const id = nextId++;
  set({ ...state, toasts: [...state.toasts.slice(-3), { id, message: text, kind }] });
}

export function dismissToast(id) {
  set({ ...state, toasts: state.toasts.filter((t) => t.id !== id) });
}

/** Hộp thoại xác nhận. Trả Promise<boolean>. */
export function confirmAsk({ title, message, confirmLabel = "Xác nhận", danger = false }) {
  return new Promise((resolve) => {
    // Có yêu cầu cũ chưa trả lời → huỷ nó.
    state.confirm?.resolve(false);
    set({ ...state, confirm: { title, message, confirmLabel, danger, resolve } });
  });
}

export function resolveConfirm(value) {
  const c = state.confirm;
  if (!c) return;
  set({ ...state, confirm: null });
  c.resolve(value);
}
