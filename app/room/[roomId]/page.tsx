import { Suspense } from "react";
import RoomPageClient from "@/components/RoomPageClient";

export const instant = false;

export default function RoomPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      }
    >
      <RoomPageClient />
    </Suspense>
  );
}