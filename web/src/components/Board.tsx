import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { Link2, Lock, Plus, Search, Tag as TagIcon } from "lucide-react";
import { useMemo, useState } from "react";
import {
  STATUS_LABELS,
  TASK_STATUSES,
  TaskStatus,
  unresolvedBlockers,
  type Project,
  type Tag,
  type Task,
} from "../../../shared/schemas";
import { groupByStatus, matchesFilter, positionInColumn, useMoveTask, useTags, useTasks, type TaskFilter } from "../hooks";
import { TagsDialog } from "./TagsDialog";
import { statusColor, TaskDialog } from "./TaskDialog";
import { ErrorBanner, ProjectAvatar, TagChip } from "./ui";

type DialogState = { kind: "task"; task?: Task; status?: TaskStatus } | { kind: "tags" } | null;

export function Board({ project }: { project: Project }) {
  const [dragging, setDragging] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [filter, setFilter] = useState<TaskFilter>({ query: "", tagId: "" });
  // Pause polling while dragging or editing so the board does not change under the cursor.
  const paused = dragging || dialog !== null;
  const { data: tasks = [], error } = useTasks(project.id, paused);
  const { data: tags = [] } = useTags(project.id, paused);
  const move = useMoveTask(project.id);

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const tagsById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  // A deleted tag must not keep filtering the board.
  const activeFilter = { ...filter, tagId: tagsById.has(filter.tagId) ? filter.tagId : "" };
  const isFiltered = Boolean(activeFilter.query.trim() || activeFilter.tagId);
  const visible = tasks.filter((t) => matchesFilter(t, activeFilter));
  const allColumns = useMemo(() => groupByStatus(tasks), [tasks]);
  const columns = groupByStatus(visible);
  const blocksCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) for (const id of t.blockedBy) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  }, [tasks]);

  const onDragEnd = ({ draggableId, source, destination }: DropResult) => {
    setDragging(false);
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    const status = TaskStatus.parse(destination.droppableId);
    const position = positionInColumn(allColumns[status], columns[status], draggableId, destination.index);
    move.mutate({ id: draggableId, status, position });
  };

  return (
    <main className="main">
      <header className="toolbar row gap-12">
        <ProjectAvatar project={project} large />
        <h1 className="grow truncate" style={{ fontSize: 15, margin: 0 }}>{project.name}</h1>
        <label className="input search">
          <Search size={13} className="text-secondary" />
          <input
            placeholder="Search tasks…"
            value={filter.query}
            onChange={(e) => setFilter({ ...filter, query: e.target.value })}
            onKeyDown={(e) => e.key === "Escape" && setFilter({ ...filter, query: "" })}
          />
        </label>
        <select
          className="input tag-filter"
          title="Filter by tag"
          value={activeFilter.tagId}
          onChange={(e) => setFilter({ ...filter, tagId: e.target.value })}
        >
          <option value="">All tags</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>{tag.label}</option>
          ))}
        </select>
        <span className="text-secondary text-small">
          {isFiltered ? `${visible.length} / ${tasks.length}` : tasks.length} tasks
        </span>
        <button className="link-btn text-small" title="Edit tags" onClick={() => setDialog({ kind: "tags" })}>
          <TagIcon size={12} /> {tags.length} tags
        </button>
        <button className="btn btn-primary" onClick={() => setDialog({ kind: "task" })}>
          <Plus size={15} /> <span className="hide-mobile">New task</span>

        </button>
      </header>

      {(error || move.error) && (
        <div style={{ padding: "12px 20px 0" }}>
          <ErrorBanner error={error ?? move.error} />
        </div>
      )}

      <DragDropContext onDragStart={() => setDragging(true)} onDragEnd={onDragEnd}>
        <div className="board">
          {TASK_STATUSES.map((status) => (
            <section key={status} className="column">
              <div className="column-header row gap-8">
                <span className="dot" style={{ background: statusColor(status) }} />
                <span className="text-label">{STATUS_LABELS[status]}</span>
                <span className="text-secondary text-small grow">{columns[status].length}</span>
                <button className="icon-btn" title={`Add to ${STATUS_LABELS[status]}`} onClick={() => setDialog({ kind: "task", status })}>
                  <Plus size={15} />
                </button>
              </div>
              <Droppable droppableId={status}>
                {(provided, snapshot) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="column-body" data-over={snapshot.isDraggingOver}>
                    {columns[status].map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(drag, dragSnapshot) => (
                          <article
                            ref={drag.innerRef}
                            {...drag.draggableProps}
                            {...drag.dragHandleProps}
                            className="card"
                            data-status={task.status}
                            data-dragging={dragSnapshot.isDragging}
                            onClick={() => setDialog({ kind: "task", task })}
                          >
                            <TaskCardContent task={task} byId={byId} tagsById={tagsById} blocks={blocksCount.get(task.id) ?? 0} />
                          </article>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </section>
          ))}
        </div>
      </DragDropContext>

      {dialog?.kind === "task" && (
        <TaskDialog
          projectId={project.id}
          task={dialog.task}
          defaultStatus={dialog.status}
          tasks={tasks}
          tags={tags}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "tags" && <TagsDialog projectId={project.id} tags={tags} tasks={tasks} onClose={() => setDialog(null)} />}
    </main>
  );
}

function TaskCardContent({
  task,
  byId,
  tagsById,
  blocks,
}: {
  task: Task;
  byId: Map<string, Task>;
  tagsById: Map<string, Tag>;
  blocks: number;
}) {
  const pending = unresolvedBlockers(task, byId);
  const tags = task.tags.flatMap((id) => tagsById.get(id) ?? []);
  return (
    <>
      <div className="card-head">
        <div className="card-title clamp-2" title={task.title}>{task.title}</div>
        {tags.length > 0 && (
          <div className="card-tags">
            {tags.map((tag) => (
              <TagChip key={tag.id} tag={tag} small />
            ))}
          </div>
        )}
      </div>
      {task.description && <div className="card-desc clamp-2">{task.description}</div>}
      {(pending.length > 0 || blocks > 0) && (
        <div className="row gap-4 wrap">
          {pending.length > 0 && (
            <span className="badge badge-danger" title={pending.map((t) => t.title).join("\n")}>
              <Lock size={11} /> Blocked by {pending.length}
            </span>
          )}
          {blocks > 0 && (
            <span className="badge">
              <Link2 size={11} /> Blocks {blocks}
            </span>
          )}
        </div>
      )}
    </>
  );
}
