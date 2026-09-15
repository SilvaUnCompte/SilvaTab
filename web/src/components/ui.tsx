import { X } from "lucide-react";
import { useEffect, type CSSProperties, type ReactNode } from "react";
import type { Project, Tag } from "../../../shared/schemas";

export function Modal({
  title,
  onClose,
  children,
  footer,
  small = false,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  small?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${small ? "modal-sm" : ""}`} role="dialog" aria-modal="true">
        <div className="modal-header row gap-8">
          <div className="grow truncate" style={{ fontWeight: 600 }}>{title}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer row gap-8">{footer}</div>
      </div>
    </div>
  );
}

/** Saturated foreground on a pastel background of the same hue (project avatars, tags). */
export const pastelStyle = (hue: number): CSSProperties => ({
  color: `hsl(${hue} 55% 30%)`,
  background: `hsl(${hue} 70% 84%)`,
});

/** Two-letter project badge. */
export function ProjectAvatar({ project, large = false }: { project: Project; large?: boolean }) {
  return (
    <span className={`avatar ${large ? "avatar-lg" : ""}`} style={pastelStyle(project.hue)} aria-hidden>
      {project.initials}
    </span>
  );
}

export function ErrorBanner({ error }: { error: unknown }) {
  if (!error) return null;
  return <div className="banner">{error instanceof Error ? error.message : String(error)}</div>;
}

export function TagChip({ tag, small = false }: { tag: Tag; small?: boolean }) {
  return (
    <span className={`tag ${small ? "tag-sm" : ""}`} style={pastelStyle(tag.hue)}>
      {tag.label}
    </span>
  );
}
