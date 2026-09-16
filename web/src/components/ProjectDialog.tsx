import { Archive } from "lucide-react";
import { useState } from "react";
import { projectInitials, randomHue, type Project } from "../../../shared/schemas";
import { useCreateProject, useDeleteProject, useUpdateProject } from "../hooks";
import { ErrorBanner, HuePalette, Modal, ProjectAvatar } from "./ui";

/** Creates a project, or renames/recolors/archives/deletes `project` when given. `onSaved(null)` means it left the list. */
export function ProjectDialog({
  project,
  onClose,
  onSaved,
}: {
  project?: Project;
  onClose: () => void;
  onSaved: (project: Project | null) => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [hue, setHue] = useState(() => project?.hue ?? randomHue());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const create = useCreateProject();
  const update = useUpdateProject();
  const remove = useDeleteProject();
  const pending = create.isPending || update.isPending || remove.isPending;

  const save = async () => {
    const saved = project ? await update.mutateAsync({ id: project.id, name, hue }) : await create.mutateAsync({ name, hue });
    onSaved(saved);
  };

  const destroy = async () => {
    if (!project) return;
    if (!confirmDelete) return setConfirmDelete(true);
    await remove.mutateAsync(project.id);
    onSaved(null);
  };

  const archive = async () => {
    if (!project) return;
    await update.mutateAsync({ id: project.id, archived: true });
    onSaved(null);
  };

  const preview = { id: "", createdAt: "", archived: false, name, hue, initials: projectInitials(name) || "?" };

  return (
    <Modal
      size="sm"

      title={project ? "Project settings" : "New project"}
      onClose={onClose}
      footer={
        <>
          {project && (
            <button className="btn btn-danger" onClick={destroy} disabled={pending}>
              {confirmDelete ? "Click again to delete all tasks" : "Delete"}
            </button>
          )}
          {project && (
            <button className="btn" onClick={archive} disabled={pending}>
              <Archive size={14} /> Archive
            </button>
          )}
          <span className="grow" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={!name.trim() || pending}>
            {project ? "Save" : "Create"}
          </button>
        </>
      }
    >
      <form
        className="row gap-12"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void save();
        }}
      >
        <ProjectAvatar project={preview} large />
        <input className="input grow" autoFocus placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} />
      </form>
      <HuePalette value={hue} onChange={setHue} />

      <ErrorBanner error={create.error ?? update.error ?? remove.error} />
    </Modal>
  );
}
