"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const emptySubscribe = () => () => {};

let scrollLockCount = 0;
let savedBodyOverflow: string | null = null;

function lockBodyScroll() {
  if (scrollLockCount === 0) {
    savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  scrollLockCount += 1;
}

function unlockBodyScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = savedBodyOverflow ?? "";
    savedBodyOverflow = null;
  }
}

type ViewportSidebarProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
  zIndex?: string;
  backdropClassName?: string;
  panelStyle?: React.CSSProperties;
  gutter?: ReactNode;
  bodyClassName?: string;
};

export default function ViewportSidebar({
  open,
  onClose,
  children,
  eyebrow,
  title,
  description,
  actions,
  header,
  footer,
  maxWidth = "max-w-xl",
  zIndex = "z-50",
  backdropClassName = "bg-black/45",
  panelStyle,
  gutter,
  bodyClassName = "min-h-0 flex-1 overflow-y-auto",
}: ViewportSidebarProps) {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    lockBodyScroll();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      unlockBodyScroll();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className={`fixed inset-0 ${zIndex} flex justify-end ${backdropClassName}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`flex h-full min-w-0 w-full flex-col overflow-hidden border-l border-border bg-surface shadow-2xl animate-slide-in-right ${maxWidth}`}
        style={panelStyle}
        role="dialog"
        aria-modal="true"
      >
        {gutter ? <div className="shrink-0">{gutter}</div> : null}
        {header ? <div className="shrink-0">{header}</div> : null}
        {!header && (eyebrow || title || actions) ? (
          <div className="z-10 flex shrink-0 items-start justify-between gap-3 border-b border-border bg-surface px-4 py-4">
            <div className="min-w-0">
              {eyebrow ? (
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                  {eyebrow}
                </p>
              ) : null}
              {title ? <h3 className="mt-1 text-xl font-semibold text-foreground">{title}</h3> : null}
              {description ? (
                <p className="mt-1 text-sm text-muted">{description}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {actions}
              <button
                type="button"
                onClick={onClose}
                className="grid size-9 place-items-center rounded-md border border-border bg-background text-foreground"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        ) : null}
        <div className={bodyClassName}>{children}</div>
        {footer ? <div className="shrink-0">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
