import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { TAG_HUES, type Tag, type Task } from "../../../shared/schemas";
import { useDeleteTag, useUpdateTag } from "../hooks";
import { ErrorBanner, Modal, pastelStyle } from "./ui";

/** Lists the project tags to rename, recolor or delete them. */
export function TagsDialog({
  projectId,
  tags,
  tasks,
  onClose,
}: {
  projectId: string;
  tags: Tag[];
  tasks: Task[];
  onClose: () => void;
}) {
  const update = useUpdateTag(projectId);
  const remove = useDeleteTag(projectId);
  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) for (const id of task.tags) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  }, [tasks]);

  return (
    <Modal small title="Tags" onClose={onClose} footer={<><span className="grow" /><button className="btn" onClick={onClose}>Close</button></>}>
      {tags.length === 0 && <div className="empty">No tag yet. Add tags from a task.</div>}
      <div className="col gap-4">
        {tags.map((tag) => (
          <TagRow
            key={tag.id}
            tag={tag}
            usage={usage.get(tag.id) ?? 0}
            onUpdate={(input) => update.mutate({ id: tag.id, ...input })}
            onDelete={() => remove.mutate(tag.id)}
          />
        ))}
      </div>
      <ErrorBanner error={update.error ?? remove.error} />
    </Modal>
  );
}

function TagRow({
  tag,
  usage,
  onUpdate,
  onDelete,
}: {
  tag: Tag;
  usage: number;
  onUpdate: (input: { label?: string; hue?: number }) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(tag.label);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const commitLabel = () => {
    const next = label.trim();
    if (next && next !== tag.label) onUpdate({ label: next });
    else setLabel(tag.label);
  };

  return (
    <div className="col gap-4">
      <div className="row gap-8">
        <button
          className="swatch"
          style={pastelStyle(tag.hue)}
          title="Change color"
          aria-expanded={paletteOpen}
          onClick={() => setPaletteOpen((open) => !open)}
        />
        <input
          className="input grow"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={commitLabel}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <span className="text-secondary text-small" style={{ width: 56, textAlign: "right" }}>
          {usage} {usage === 1 ? "task" : "tasks"}
        </span>
        <button
          className={`icon-btn ${confirmDelete ? "text-danger" : ""}`}
          title={confirmDelete ? "Click again to delete" : "Delete tag"}
          onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
          onBlur={() => setConfirmDelete(false)}
        >
          <Trash2 size={14} />
        </button>
      </div>
      {paletteOpen && (
        <div className="palette">
          {TAG_HUES.map((hue) => (
            <button
              key={hue}
              className="swatch"
              style={pastelStyle(hue)}
              aria-pressed={hue === tag.hue}
              aria-label={`Hue ${hue}`}
              onClick={() => {
                onUpdate({ hue });
                setPaletteOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
