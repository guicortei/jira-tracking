import { enrichIssuesWithChangelog } from "./changelog";
import { daysBetween, getSiteBaseUrl, jiraFetch } from "./fetch";
import type { JiraIssue, JiraLinkedIssue, JiraProject } from "./types";

const SPRINT_FIELD = "customfield_10220";
const STORY_POINTS_FIELD = "customfield_10016";

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
      customfield_10016?: number | null;
      issuelinks?: JiraIssueLink[];
    };
  }>;
  isLast?: boolean;
  nextPageToken?: string;
};

type JiraIssueLink = {
  type?: {
    name?: string | null;
    inward?: string | null;
    outward?: string | null;
  };
  inwardIssue?: {
    id: string;
    key: string;
    fields?: {
      summary?: string;
      status?: { name: string };
    };
  };
  outwardIssue?: {
    id: string;
    key: string;
    fields?: {
      summary?: string;
      status?: { name: string };
    };
  };
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

type JiraIssueResponse = {
  fields?: {
    issuelinks?: JiraIssueLink[];
  };
};

const ISSUE_FIELDS = [
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
  STORY_POINTS_FIELD,
  "issuelinks",
];

function mapLinkedIssuesFromLinks(links: JiraIssueLink[] | undefined): JiraLinkedIssue[] {
  if (!links?.length) return [];
  const unique = new Map<string, JiraLinkedIssue>();

  for (const link of links) {
    const linked = link.inwardIssue ?? link.outwardIssue;
    if (!linked || unique.has(linked.id)) continue;

    unique.set(linked.id, {
      id: linked.id,
      key: linked.key,
      summary: linked.fields?.summary ?? linked.key,
      status: linked.fields?.status?.name ?? "—",
    });
  }

  return [...unique.values()];
}

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
    storyPoints: issue.fields.customfield_10016 ?? null,
    linkedIssues: mapLinkedIssuesFromLinks(issue.fields.issuelinks),
  };
}

export async function listIssues(projectKey: string): Promise<JiraIssue[]> {
  const apiBase = getSiteBaseUrl();
  const issues: JiraIssue[] = [];
  let nextPageToken: string | undefined;

  while (true) {
    const body: Record<string, unknown> = {
      jql: `project = "${projectKey}" ORDER BY updated DESC`,
      maxResults: 100,
      fields: ISSUE_FIELDS,
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

export async function listLinkedIssues(issueKey: string): Promise<JiraIssue[]> {
  const apiBase = getSiteBaseUrl();
  const issue = await jiraFetch<JiraIssueResponse>(
    `${apiBase}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=issuelinks`,
  );
  const linkedIssues = mapLinkedIssuesFromLinks(issue.fields?.issuelinks);

  if (linkedIssues.length === 0) {
    return [];
  }

  const keys = linkedIssues.map((linked) => `"${linked.key}"`).join(",");
  const data = await jiraFetch<JiraSearchResponse>(`${apiBase}/rest/api/3/search/jql`, {
    method: "POST",
    body: JSON.stringify({
      jql: `issuekey in (${keys}) ORDER BY updated DESC`,
      maxResults: 100,
      fields: ISSUE_FIELDS,
    }),
  });

  const issues = data.issues.map(mapIssueFromSearch);
  return enrichIssuesWithChangelog(issues);
}
