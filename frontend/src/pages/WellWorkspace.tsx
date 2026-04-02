import { useParams, useNavigate } from "react-router-dom";

export function WellWorkspace() {
  const { wellId } = useParams<{ wellId: string }>();
  const navigate = useNavigate();

  return (
    <div className="p-8 space-y-6 max-w-7xl">
      <button
        onClick={() => navigate("/")}
        className="text-on-surface/50 hover:text-primary-container transition-colors flex items-center gap-2 text-sm"
      >
        <span className="material-symbols-outlined text-lg">arrow_back</span>
        Back to Exception Feed
      </button>
      <div className="bg-surface-container-low rounded-xl p-8 border-l-4 border-primary-container">
        <h1 className="text-2xl font-bold font-headline text-on-surface mb-2">
          Well Workspace
        </h1>
        <p className="text-on-surface/60 font-label text-sm">
          WELL ID: {wellId} // WORKSPACE LOADING
        </p>
      </div>
      <div className="bg-surface-container-lowest rounded-xl p-12 flex items-center justify-center">
        <div className="text-center space-y-4">
          <span className="material-symbols-outlined text-5xl text-on-surface/10">
            construction
          </span>
          <p className="text-sm text-on-surface/30 font-headline font-bold uppercase tracking-widest">
            Well Workspace Under Construction
          </p>
          <p className="text-xs text-on-surface/20 font-label">
            Load groups, verification, and dispatch actions coming soon
          </p>
        </div>
      </div>
    </div>
  );
}
