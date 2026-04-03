import { useState } from "react";
import { setPin } from "../lib/api";

interface PinGateProps {
  onSuccess: () => void;
}

export function PinGate({ onSuccess }: PinGateProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError(true);
      return;
    }
    setPin(trimmed);
    onSuccess();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-surface-container p-8"
      >
        <div className="mb-6 text-center">
          <span className="material-symbols-outlined mb-3 block text-[40px] text-primary">
            lock
          </span>
          <h1 className="font-headline text-xl font-bold text-on-surface">
            Health Dashboard
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Enter the dashboard PIN to continue
          </p>
        </div>

        <label htmlFor="pin-input" className="sr-only">
          Dashboard PIN
        </label>
        <input
          id="pin-input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          placeholder="PIN"
          className={`w-full rounded-lg bg-surface-container-low px-4 py-3 font-label text-center text-lg tracking-[0.3em] text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary-container ${
            error ? "ring-2 ring-error" : ""
          }`}
        />
        {error && (
          <p className="mt-2 text-center text-xs text-error">
            Please enter a valid PIN
          </p>
        )}

        <button
          type="submit"
          className="mt-6 w-full rounded-lg bg-primary-container px-4 py-3 font-headline text-sm font-bold text-on-primary-container transition-opacity hover:opacity-90 active:opacity-80"
        >
          Unlock
        </button>
      </form>
    </div>
  );
}
