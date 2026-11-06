import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Card({ title, icon, meta, actions, className = '', children, id }: {
  title?: ReactNode;
  icon?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className={`card ${className}`} id={id} aria-label={typeof title === 'string' ? title : undefined}>
      {title && (
        <header className="card-head">
          <h2>
            {icon}
            {title}
          </h2>
          {meta && <span className="meta">{meta}</span>}
          {actions && <div className="actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Native <dialog>: gives us Escape-to-close, focus trapping and a top layer for free. */
export function Dialog({ open, onClose, className = 'modal', children, label }: {
  open: boolean;
  onClose: () => void;
  className?: string;
  children: ReactNode;
  label: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={className}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && children}
    </dialog>
  );
}

export function DialogHead({ title, onClose }: { title: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-head">
      <h2>{title}</h2>
      <button className="icon-btn" onClick={onClose} aria-label="Close">
        <X size={18} />
      </button>
    </div>
  );
}

export function Ring({ value, size = 44, stroke = 4, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="ring" style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle className="track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle className="bar" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - v)} />
      </svg>
      {children && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600 }}>{children}</div>}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <b>{title}</b>
      {children && <span>{children}</span>}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className="switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />;
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: { value: T; label: ReactNode; count?: number }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined && o.count > 0 && <span className="count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- Toasts ---------- */

interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}
let toasts: Toast[] = [];
const toastListeners = new Set<() => void>();
const emit = () => toastListeners.forEach((l) => l());

export function toast(text: string, action?: Toast['action'], ms = 4500) {
  const t = { id: Date.now() + Math.random(), text, action };
  toasts = [...toasts.slice(-2), t];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    emit();
  }, ms);
}

export function Toasts() {
  const list = useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toasts,
  );
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div className="toast" key={t.id}>
          {t.text}
          {t.action && (
            <button
              onClick={() => {
                t.action!.run();
                toasts = toasts.filter((x) => x.id !== t.id);
                emit();
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
