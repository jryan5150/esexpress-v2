import { useParams } from "react-router-dom";

export function DispatchConfirmation() {
  const { wellId } = useParams<{ wellId: string }>();

  return (
    <div className="p-[var(--space-6)]">
      <h1 className="text-[var(--text-xl)] font-semibold mb-[var(--space-2)]">
        Dispatch Confirmation
      </h1>
      <p className="text-[var(--text-secondary)]">
        Well {wellId} dispatched — Stitch design drops here
      </p>
    </div>
  );
}
