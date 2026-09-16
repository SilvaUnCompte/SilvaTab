import { ArchiveRestore } from "lucide-react";
import { useArchivedProjects, useUpdateProject } from "../hooks";
import { ErrorBanner, Modal, ProjectAvatar } from "./ui";

/** Lists archived projects so they can be restored. */
export function ArchiveDialog({ onClose, onRestored }: { onClose: () => void; onRestored: (id: string) => void }) {
  const { data: projects = [], isPending, error } = useArchivedProjects();
  const update = useUpdateProject();

  const restore = async (id: string) => {
    await update.mutateAsync({ id, archived: false });
    onRestored(id);
  };

  return (
    <Modal size="sm" title="Archived projects" onClose={onClose} footer={<><span className="grow" /><button className="btn" onClick={onClose}>Close</button></>}>
      {!isPending && projects.length === 0 && <div className="empty">No archived project</div>}
      <div className="col gap-4">
        {projects.map((project) => (
          <div key={project.id} className="row gap-8">
            <ProjectAvatar project={project} />
            <span className="grow truncate">{project.name}</span>
            <button className="btn" onClick={() => restore(project.id)} disabled={update.isPending}>
              <ArchiveRestore size={14} /> Unarchive
            </button>
          </div>
        ))}
      </div>
      <ErrorBanner error={error ?? update.error} />
    </Modal>
  );
}
