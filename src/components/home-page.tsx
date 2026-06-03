"use client";

import dynamic from "next/dynamic";

export const HomePage = dynamic(
  () =>
    import("@/components/jira-dashboard").then((mod) => mod.JiraDashboard),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto min-h-[60vh] max-w-6xl animate-pulse px-4 py-8 sm:px-6">
        <div className="mb-8 h-24 rounded-2xl bg-zinc-200" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-32 rounded-2xl bg-zinc-200" />
          <div className="h-32 rounded-2xl bg-zinc-200" />
        </div>
      </div>
    ),
  },
);
