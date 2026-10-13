import { Suspense } from "react";
import HistoryPageClient from "@/components/HistoryPageClient";

export default function HistoryPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      }
    >
      <HistoryPageClient />
    </Suspense>
  );
}