import { useState, useCallback } from "react";
import { hasPin } from "./lib/api";
import { PinGate } from "./components/PinGate";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { Overview } from "./sections/Overview";
import { Pipeline } from "./sections/Pipeline";
import { Performance } from "./sections/Performance";
import { Errors } from "./sections/Errors";
import { Feedback } from "./sections/Feedback";
import { useHealth } from "./hooks/use-diag";

const SECTIONS = ["Overview", "Pipeline", "Performance", "Errors", "Feedback"];

function Dashboard() {
  const [active, setActive] = useState("Overview");
  const health = useHealth();

  const content = (() => {
    switch (active) {
      case "Overview":
        return <Overview />;
      case "Pipeline":
        return <Pipeline />;
      case "Performance":
        return <Performance />;
      case "Errors":
        return <Errors />;
      case "Feedback":
        return <Feedback />;
      default:
        return <Overview />;
    }
  })();

  return (
    <div className="flex h-screen flex-col bg-background">
      <Header
        status={health.data?.status ?? null}
        lastRefresh={health.data?.timestamp ?? null}
      />

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <Sidebar sections={SECTIONS} active={active} onSelect={setActive} />

        <main className="flex-1 overflow-y-auto p-4 md:p-6">{content}</main>
      </div>
    </div>
  );
}

export function App() {
  const [authed, setAuthed] = useState(hasPin());
  const handleSuccess = useCallback(() => setAuthed(true), []);

  if (!authed) {
    return <PinGate onSuccess={handleSuccess} />;
  }

  return <Dashboard />;
}
