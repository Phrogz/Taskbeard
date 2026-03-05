import { useEffect, useRef } from "react";

export type ToastVariant = "error" | "success";

export type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
  autoCloseMs?: number;
};

type Props = {
  items: ToastItem[];
  onDismiss: (id: string) => void;
  autoCloseMs?: number;
};

export function Toast({ items, onDismiss, autoCloseMs = 8000 }: Props) {
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    for (const item of items) {
      if (timers.current.has(item.id)) continue;
      const timer = setTimeout(() => {
        timers.current.delete(item.id);
        onDismiss(item.id);
      }, item.autoCloseMs ?? autoCloseMs);
      timers.current.set(item.id, timer);
    }

    const activeIds = new Set(items.map((i) => i.id));
    for (const [id, timer] of timers.current) {
      if (!activeIds.has(id)) {
        clearTimeout(timer);
        timers.current.delete(id);
      }
    }
  }, [items, onDismiss, autoCloseMs]);

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="toast-container">
      {items.map((item) => (
        <div key={item.id} className={`toast-item ${item.variant}`}>
          <span className="toast-message">{item.message}</span>
          <button
            className="toast-dismiss"
            onClick={() => onDismiss(item.id)}
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
