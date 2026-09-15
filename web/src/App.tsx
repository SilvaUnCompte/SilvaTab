import { useEffect } from "react";
import { Board } from "./components/Board";
import { LoginScreen } from "./components/LoginScreen";
import { Sidebar } from "./components/Sidebar";
import { useHashState, useProjects, useSession } from "./hooks";

export function App() {
  const session = useSession();
  if (session.isPending) return null;
  return session.data?.authenticated ? <Workspace /> : <LoginScreen />;
}

function Workspace() {
  const { data: projects = [], isPending } = useProjects();
  const [selectedId, setSelectedId] = useHashState();
  const selected = projects.find((p) => p.id === selectedId);

  // Fall back to the first project when nothing (or a deleted project) is selected.
  useEffect(() => {
    if (!isPending && !selected && projects.length) setSelectedId(projects[0].id);
  }, [isPending, selected, projects, setSelectedId]);

  return (
    <div className="app">
      <Sidebar projects={projects} selectedId={selectedId} onSelect={setSelectedId} />
      {selected ? (
        <Board key={selected.id} project={selected} />
      ) : (
        <main className="main">
          <div className="center grow text-secondary">{isPending ? "" : "Create a project to get started"}</div>
        </main>
      )}
    </div>
  );
}
