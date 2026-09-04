import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  title: string;
  eyebrow: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ title, eyebrow, open, onClose, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = ""; };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div><p className="section-kicker">{eyebrow}</p><h2 id="modal-title" className="mt-1 text-lg font-semibold text-white">{title}</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={17} /></button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto p-5 sm:p-6">{children}</div>
      </section>
    </div>
  );
}
