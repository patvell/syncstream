"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Film, Lock, Delete } from "lucide-react";

const DIGITS = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  [-1, 0, -2], // -1 = delete, -2 = enter
];

export default function LoginPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const verifyPin = useCallback(
    async (pinValue: string) => {
      setLoading(true);
      setError(false);

      try {
        const res = await fetch("/api/auth/verify-pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: pinValue }),
        });

        if (res.ok) {
          router.push("/");
        } else {
          setError(true);
          setPin("");
          // Reset error state after shake animation
          setTimeout(() => setError(false), 500);
        }
      } catch {
        setError(true);
        setPin("");
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  const handleDigit = useCallback(
    (digit: number) => {
      if (loading) return;
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 4) {
        verifyPin(newPin);
      }
    },
    [pin, loading, verifyPin]
  );

  const handleDelete = useCallback(() => {
    if (loading || pin.length === 0) return;
    setPin(pin.slice(0, -1));
  }, [pin, loading]);

  const handleKey = useCallback(
    (key: string) => {
      const num = parseInt(key);
      if (!isNaN(num) && num >= 0 && num <= 9) {
        handleDigit(num);
      } else if (key === "Backspace" || key === "Delete") {
        handleDelete();
      } else if (key === "Enter") {
        // If 4 digits entered, verify
        if (pin.length === 4) verifyPin(pin);
      }
    },
    [handleDigit, handleDelete, pin, verifyPin]
  );

  // Global keyboard listener
  useEffect(() => {
    window.addEventListener("keydown", (e) => handleKey(e.key));
    return () => window.removeEventListener("keydown", (e) => handleKey(e.key));
  }, [handleKey]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
      <div
        ref={containerRef}
        className={`w-full max-w-sm mx-auto flex flex-col items-center gap-8 ${
          error ? "animate-shake" : ""
        }`}
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
            <Film className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">SyncStream</h1>
          <p className="text-sm text-zinc-400">
            Enter the PIN to get started
          </p>
        </div>

        {/* PIN dots */}
        <div className="flex gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`pin-dot w-4 h-4 rounded-full border-2 ${
                i < pin.length
                  ? "bg-emerald-500 border-emerald-500"
                  : error
                  ? "bg-red-500/20 border-red-500"
                  : "bg-transparent border-zinc-600"
              }`}
            />
          ))}
        </div>

        {/* Error message */}
        {error && (
          <p className="text-sm text-red-400 animate-fade-in">
            Incorrect PIN. Try again.
          </p>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3 w-64">
          {DIGITS.flat().map((digit, idx) => {
            if (digit === -1) {
              // Delete button
              return (
                <button
                  key={`del-${idx}`}
                  onClick={handleDelete}
                  disabled={loading}
                  className="focusable h-14 rounded-xl bg-zinc-800/60 hover:bg-zinc-700/60 active:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-40"
                  tabIndex={0}
                  aria-label="Delete"
                >
                  <Delete className="w-5 h-5" />
                </button>
              );
            }
            if (digit === -2) {
              // Enter/Confirm button
              return (
                <button
                  key={`enter-${idx}`}
                  onClick={() => pin.length === 4 && verifyPin(pin)}
                  disabled={loading || pin.length !== 4}
                  className="focusable h-14 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 active:bg-emerald-500/40 flex items-center justify-center text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-30"
                  tabIndex={0}
                  aria-label="Enter"
                >
                  <Lock className="w-5 h-5" />
                </button>
              );
            }
            // Number buttons
            return (
              <button
                key={`num-${digit}`}
                onClick={() => handleDigit(digit)}
                disabled={loading}
                className={`focusable h-14 rounded-xl bg-zinc-800/60 hover:bg-zinc-700/60 active:bg-zinc-700 flex items-center justify-center text-xl font-semibold text-zinc-200 hover:text-zinc-50 transition-all disabled:opacity-40`}
                tabIndex={0}
              >
                {digit}
              </button>
            );
          })}
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-zinc-400 text-sm animate-fade-in">
            <div className="w-4 h-4 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin" />
            Verifying...
          </div>
        )}
      </div>
    </div>
  );
}