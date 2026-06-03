"use client";

import { IssueList } from "@/components/issue-list";
import { ProjectList } from "@/components/project-list";
import { ProjectProjectionPanel } from "@/components/project-projection";
import { isCheckoutProject } from "@/lib/jira/projection";
import type { JiraIssue, JiraProject } from "@/lib/jira/types";
import { useCallback, useEffect, useState } from "react";

export function JiraDashboard() {
  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<JiraProject | null>(
    null,
  );
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCheckout = selectedProject
    ? isCheckoutProject(selectedProject.key)
    : false;

  useEffect(() => {
    async function loadProjects() {
      setLoadingProjects(true);
      setError(null);

      try {
        const response = await fetch("/api/projects");
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Falha ao carregar projetos.");
        }

        setProjects(data.projects);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Falha ao carregar projetos.",
        );
      } finally {
        setLoadingProjects(false);
      }
    }

    loadProjects();
  }, []);

  const loadIssues = useCallback(async (project: JiraProject) => {
    setLoadingIssues(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${project.key}/issues`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Falha ao carregar tickets.");
      }

      setIssues(data.issues);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao carregar tickets.",
      );
    } finally {
      setLoadingIssues(false);
    }
  }, []);

  const handleSelectProject = (project: JiraProject) => {
    setSelectedProject(project);
    setIssues([]);
    loadIssues(project);
  };

  const handleBack = () => {
    setSelectedProject(null);
    setIssues([]);
    setError(null);
  };

  return (
    <div
      className={`mx-auto w-full px-4 py-8 sm:px-6 ${isCheckout ? "max-w-7xl" : "max-w-6xl"}`}
    >
      {!isCheckout && (
        <header className="mb-8">
          <p className="text-sm font-medium uppercase tracking-wide text-blue-600">
            Jira Tracking
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-zinc-900">
            {selectedProject ? "Tickets do projeto" : "Selecione um projeto"}
          </h1>
          <p className="mt-2 max-w-2xl text-zinc-600">
            {selectedProject
              ? "Lista de tickets do projeto selecionado."
              : "Escolha um projeto Jira para visualizar os tickets."}
          </p>
        </header>
      )}

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {selectedProject ? (
        <>
          {isCheckout ? (
            <>
              <ProjectProjectionPanel
                projectKey={selectedProject.key}
                projectName={selectedProject.name}
                project={selectedProject}
                issues={issues}
                issuesLoading={loadingIssues}
                onBack={handleBack}
              />
              <IssueList
                project={selectedProject}
                issues={issues}
                loading={loadingIssues}
                onBack={handleBack}
                compactHeader
              />
            </>
          ) : (
            <IssueList
              project={selectedProject}
              issues={issues}
              loading={loadingIssues}
              onBack={handleBack}
            />
          )}
        </>
      ) : (
        <ProjectList
          projects={projects}
          onSelect={handleSelectProject}
          loading={loadingProjects}
        />
      )}
    </div>
  );
}
