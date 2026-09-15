import { Lock, Tag as TagIcon } from "lucide-react";
import { useMemo, useState } from "react";
import Markdown from "react-markdown";
import { reachesTask, STATUS_LABELS, TASK_STATUSES, type Tag, type Task, type TaskStatus } from "../../../shared/schemas";
import { useCreateTag, useDeleteTask, useSaveTask, type TaskDraft } from "../hooks";
import { ChipPicker } from "./ChipPicker";
import { ErrorBanner, Modal, pastelStyle, TagChip } from "./ui";

export const statusColor = (status: TaskStatus) => `var(--status-${status})`;

/** Creates a task, or edits `task` when given. */
export function TaskDialog({
  projectId,
  task,
  tasks,
  tags,
  defaultStatus = "todo",
  onClose,
}: {
  projectId: string;
  task?: Task;
  tasks: Task[];
  tags: Tag[];
  defaultStatus?: TaskStatus;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<TaskDraft>({
    title: task?.title ?? "",
    description: task?.description ?? "",
    blockedBy: task?.blockedBy ?? [],
    tags: task?.tags ?? [],
    status: task?.status ?? defaultStatus,
  });
  const [preview, setPreview] = useState(Boolean(task?.description));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useSaveTask(projectId);
  const remove = useDeleteTask(projectId);
  const set = (patch: Partial<TaskDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const submit = async () => {
    await save.mutateAsync({ ...draft, id: task?.id });
    onClose();
  };

  const destroy = async () => {
    if (!task) return;
    if (!confirmDelete) return setConfirmDelete(true);
    await remove.mutateAsync(task.id);
    onClose();
  };

  return (
    <Modal
      title={task ? "Edit task" : "New task"}
      onClose={onClose}
      footer={
        <>
          {task && (
            <button className="btn btn-danger" onClick={destroy} disabled={remove.isPending}>
              {confirmDelete ? "Click again to delete" : "Delete"}
            </button>
          )}
          <span className="grow" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={!draft.title.trim() || save.isPending}>
            {task ? "Save" : "Create"}
          </button>
        </>
      }
    >
      <div className="row gap-12">
        <label className="field grow">
          <span className="text-label">Title</span>
          <input className="input" autoFocus value={draft.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label className="field" style={{ width: 140 }}>
          <span className="text-label">Column</span>
          <select className="input" value={draft.status} onChange={(e) => set({ status: e.target.value as TaskStatus })}>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="field">
        <div className="row">
          <span className="text-label grow">Description</span>
          <div className="tabs" role="tablist">
            <button type="button" className="tab" role="tab" aria-selected={!preview} onClick={() => setPreview(false)}>Write</button>
            <button type="button" className="tab" role="tab" aria-selected={preview} onClick={() => setPreview(true)}>Preview</button>
          </div>
        </div>
        {preview ? (
          <div className="markdown" onDoubleClick={() => setPreview(false)}>
            {draft.description ? <Markdown>{draft.description}</Markdown> : <span className="text-secondary">Nothing to preview</span>}
          </div>
        ) : (
          <textarea
            className="input"
            rows={10}
            placeholder="Specs, context, acceptance criteria… (Markdown)"
            value={draft.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        )}
      </div>

      <TagsField projectId={projectId} tags={tags} value={draft.tags} onChange={(ids) => set({ tags: ids })} />

      <BlockersField
        selfId={task?.id}
        tasks={tasks}
        byId={byId}
        value={draft.blockedBy}
        onChange={(blockedBy) => set({ blockedBy })}
      />

      <ErrorBanner error={save.error ?? remove.error} />
    </Modal>
  );
}

function BlockersField({
  selfId,
  tasks,
  byId,
  value,
  onChange,
}: {
  selfId?: string;
  tasks: Task[];
  byId: Map<string, Task>;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const options = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.id !== selfId &&
          !value.includes(t.id) &&
          // Hide tasks that already depend on this one: picking them would create a cycle.
          !(selfId && reachesTask([t.id], selfId, (id) => byId.get(id)?.blockedBy)),
      ),
    [tasks, selfId, value, byId],
  );
  const statusDot = (task: Task) => <span className="dot" style={{ background: statusColor(task.status) }} />;

  return (
    <ChipPicker
      label={<><Lock size={11} /> Blocked by</>}
      placeholder="Search a task to add as blocker…"
      selected={resolveIds(value, byId)}
      options={options}
      getId={(t) => t.id}
      getText={(t) => t.title}
      renderChip={(t) => <>{statusDot(t)}<span className="truncate">{t.title}</span></>}
      renderOption={(t) => (
        <>
          {statusDot(t)}
          <span className="grow truncate">{t.title}</span>
          <span className="text-secondary text-small">{STATUS_LABELS[t.status]}</span>
        </>
      )}
      onAdd={(t) => onChange([...value, t.id])}
      onRemove={(t) => onChange(value.filter((id) => id !== t.id))}
    />
  );
}

function TagsField({
  projectId,
  tags,
  value,
  onChange,
}: {
  projectId: string;
  tags: Tag[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const createTag = useCreateTag(projectId);
  const byId = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  return (
    <>
      <ChipPicker
        label={<><TagIcon size={11} /> Tags</>}
        placeholder="Search or create a tag…"
        selected={resolveIds(value, byId)}
        options={tags.filter((t) => !value.includes(t.id))}
        getId={(t) => t.id}
        getText={(t) => t.label}
        chipStyle={(t) => pastelStyle(t.hue)}
        renderChip={(t) => <span className="truncate">{t.label}</span>}
        renderOption={(t) => <TagChip tag={t} />}
        onAdd={(t) => onChange([...value, t.id])}
        onRemove={(t) => onChange(value.filter((id) => id !== t.id))}
        onCreate={async (label) => {
          const tag = await createTag.mutateAsync(label);
          onChange([...value, tag.id]);
        }}
      />
      <ErrorBanner error={createTag.error} />
    </>
  );
}

/** Items for the given ids, skipping ids that no longer exist. */
function resolveIds<T>(ids: string[], byId: Map<string, T>): T[] {
  return ids.map((id) => byId.get(id)).filter((item): item is T => item !== undefined);
}
