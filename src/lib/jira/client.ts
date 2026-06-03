import { enrichIssuesWithChangelog } from "./changelog";
import { daysBetween, getSiteBaseUrl, jiraFetch } from "./fetch";
import type { JiraIssue, JiraProject } from "./types";

const SPRINT_FIELD = "customfield_10220";

type JiraSearchResponse = {
  issues: Array<{
    id: string;
    key: string;
    fields: {
      summary: string;
      created: string;
      updated: string;
      resolutiondate?: string | null;
      status?: { name: string };
      issuetype?: { name: string };
      priority?: { name: string } | null;
      assignee?: { displayName: string } | null;
      project?: { key: string; name: string };
      customfield_10220?: number | null;
    };
  }>;
  isLast?: boolean;
  nextPageToken?: string;
};

type ProjectSearchResponse = {
  values: Array<{
    id: string;
    key: string;
    name: string;
    avatarUrls?: { "48x48"?: string };
  }>;
  isLast: boolean;
  startAt: number;
  maxResults: number;
  total: number;
};

export async function listProjects(): Promise<JiraProject[]> {
  const siteUrl = getSiteBaseUrl();
  const projects: JiraProject[] = [];
  let startAt = 0;
  const maxResults = 50;

  while (true) {
    const data = await jiraFetch<ProjectSearchResponse>(
      `${siteUrl}/rest/api/3/project/search?startAt=${startAt}&maxResults=${maxResults}`,
    );

    projects.push(
      ...data.values.map((project) => ({
        id: project.id,
        key: project.key,
        name: project.name,
        avatarUrl: project.avatarUrls?.["48x48"],
        siteUrl,
      })),
    );

    if (data.isLast) {
      break;
    }

    startAt += data.maxResults;
  }

  return projects.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function mapIssueFromSearch(
  issue: JiraSearchResponse["issues"][number],
): JiraIssue {
  const resolutionDate = issue.fields.resolutiondate ?? null;

  return {
    id: issue.id,
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status?.name ?? "—",
    issueType: issue.fields.issuetype?.name ?? "—",
    priority: issue.fields.priority?.name ?? null,
    assignee: issue.fields.assignee?.displayName ?? null,
    projectKey: issue.fields.project?.key ?? "—",
    projectName: issue.fields.project?.name ?? "—",
    created: issue.fields.created,
    updated: issue.fields.updated,
    resolutionDate,
    daysToResolve: resolutionDate
      ? daysBetween(issue.fields.created, resolutionDate)
      : null,
    workStartedAt: null,
    daysCycleTime: null,
    daysInProgress: null,
    sprint: issue.fields.customfield_10220 ?? null,
  };
}

export async function listIssues(projectKey: string): Promise<JiraIssue[]> {
  const apiBase = getSiteBaseUrl();
  const fields = [
    "summary",
    "status",
    "issuetype",
    "priority",
    "assignee",
    "project",
    "created",
    "updated",
    "resolutiondate",
    SPRINT_FIELD,
  ];
  const issues: JiraIssue[] = [];
  let nextPageToken: string | undefined;

  while (true) {
    const body: Record<string, unknown> = {
      jql: `project = "${projectKey}" ORDER BY updated DESC`,
      maxResults: 100,
      fields,
    };

    if (nextPageToken) {
      body.nextPageToken = nextPageToken;
    }

    const data = await jiraFetch<JiraSearchResponse>(
      `${apiBase}/rest/api/3/search/jql`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );

    issues.push(...data.issues.map(mapIssueFromSearch));

    if (data.isLast || !data.nextPageToken) {
      break;
    }

    nextPageToken = data.nextPageToken;
  }

  return enrichIssuesWithChangelog(issues);
}
