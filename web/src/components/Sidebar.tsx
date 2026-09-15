import { Archive, LogOut, Plus, Settings } from "lucide-react";
import { useState } from "react";
import type { Project } from "../../../shared/schemas";
import { useLogout } from "../hooks";
import { ArchiveDialog } from "./ArchiveDialog";
import { ProjectDialog } from "./ProjectDialog";
import { ProjectAvatar } from "./ui";

type DialogState = { kind: "project"; project?: Project } | { kind: "archive" } | null;

export function Sidebar({
  projects,
  selectedId,
  onSelect,
}: {
  projects: Project[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const logout = useLogout();

  return (
    <aside className="sidebar col">
      <header className="sidebar-header row gap-8">
        <span className="brand-mark" />
        <span className="brand grow">Silva's Tab</span>
        <button className="icon-btn" title="Sign out" onClick={() => logout.mutate(undefined)}>
          <LogOut size={15} />
        </button>
      </header>

      <div className="row" style={{ padding: "12px 8px 6px 14px" }}>
        <span className="text-label grow">Projects</span>
        <button className="icon-btn" title="New project" onClick={() => setDialog({ kind: "project" })}>
          <Plus size={16} />
        </button>
      </div>

      <nav className="col gap-4 scroll-y grow" style={{ padding: "0 6px 12px" }}>
        {projects.map((project) => (
          <div
            key={project.id}
            role="button"
            tabIndex={0}
            className="project-item"
            aria-current={project.id === selectedId}
            onClick={() => onSelect(project.id)}
            onKeyDown={(e) => e.key === "Enter" && onSelect(project.id)}
          >
            <ProjectAvatar project={project} />
            <span className="grow truncate">{project.name}</span>
            <button
              className="icon-btn"
              title="Project settings"
              onClick={(e) => {
                e.stopPropagation();
                setDialog({ kind: "project", project });
              }}
            >
              <Settings size={14} />
            </button>
          </div>
        ))}
        {projects.length === 0 && <div className="empty text-small">No project yet</div>}
      </nav>

      <footer className="sidebar-footer row">
        <button className="link-btn text-small" onClick={() => setDialog({ kind: "archive" })}>
          <Archive size={13} /> Archive
        </button>
      </footer>

      {dialog?.kind === "archive" && (
        <ArchiveDialog
          onClose={() => setDialog(null)}
          onRestored={(id) => {
            setDialog(null);
            onSelect(id);
          }}
        />
      )}
      {dialog?.kind === "project" && (
        <ProjectDialog
          project={dialog.project}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setDialog(null);
            if (saved) onSelect(saved.id);
            else if (dialog.project?.id === selectedId) onSelect(null);
          }}
        />
      )}
    </aside>
  );
}
