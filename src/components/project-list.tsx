"use client";

import type { JiraProject } from "@/lib/jira/types";

type ProjectListProps = {
  projects: JiraProject[];
  onSelect: (project: JiraProject) => void;
  loading?: boolean;
};

export function ProjectList({
  projects,
  onSelect,
  loading = false,
}: ProjectListProps) {
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100"
          />
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-zinc-500">
        Nenhum projeto Jira encontrado para esta conta.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {projects.map((project) => (
        <button
          key={project.id}
          type="button"
          onClick={() => onSelect(project)}
          className="group flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-left transition hover:border-blue-500 hover:shadow-sm"
        >
          {project.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={project.avatarUrl}
              alt=""
              className="mt-0.5 h-10 w-10 rounded-lg"
            />
          ) : (
            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-sm font-semibold text-blue-700">
              {project.key.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-zinc-900 group-hover:text-blue-700">
              {project.name}
            </p>
            <p className="truncate text-sm text-zinc-500">{project.key}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
