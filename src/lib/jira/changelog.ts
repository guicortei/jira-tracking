import { normalizeStatus } from "@/components/status-timeline";
import type { JiraIssue } from "./types";
import { daysBetween, getSiteBaseUrl, jiraFetch } from "./fetch";

const CHANGELOG_PAGE_SIZE = 100;
const CHANGELOG_CONCURRENCY = 8;
const TODO_STATUS = "A FAZER";

type ChangelogItem = {
  field: string;
  fromString?: string | null;
  toString?: string | null;
};

type ChangelogHistory = {
  created: string;
  items: ChangelogItem[];
};

type ChangelogResponse = {
  startAt: number;
  maxResults: number;
  total: number;
  values: ChangelogHistory[];
};

function isTodoStatus(status: string) {
  return normalizeStatus(status) === TODO_STATUS;
}

export function extractWorkStartedAt(histories: ChangelogHistory[]): string | null {
  const sorted = [...histories].sort(
    (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime(),
  );

  for (const history of sorted) {
    for (const item of history.items) {
      if (item.field !== "status") continue;

      const from = item.fromString ?? "";
      const to = item.toString ?? "";

      if (isTodoStatus(from) && !isTodoStatus(to)) {
        return history.created;
      }
    }
  }

  return null;
}

async function fetchIssueChangelog(issueKey: string): Promise<ChangelogHistory[]> {
  const siteUrl = getSiteBaseUrl();
  const histories: ChangelogHistory[] = [];
  let startAt = 0;

  while (true) {
    const data = await jiraFetch<ChangelogResponse>(
      `${siteUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/changelog?startAt=${startAt}&maxResults=${CHANGELOG_PAGE_SIZE}`,
    );

    histories.push(...data.values);

    if (startAt + data.values.length >= data.total || data.values.length === 0) {
      break;
    }

    startAt += data.maxResults;
  }

  return histories;
}

async function runConcurrent<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency: number,
) {
  const queue = [...items];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item !== undefined) {
        await worker(item);
      }
    }
  });

  await Promise.all(workers);
}

function resolveWorkStartedAt(
  issue: JiraIssue,
  changelogStartedAt: string | null,
): string | null {
  if (changelogStartedAt) {
    return changelogStartedAt;
  }

  if (isTodoStatus(issue.status)) {
    return null;
  }

  return issue.created;
}

function enrichIssueWithWorkDates(
  issue: JiraIssue,
  changelogStartedAt: string | null,
): JiraIssue {
  const workStartedAt = resolveWorkStartedAt(issue, changelogStartedAt);
  const nowIso = new Date().toISOString();

  const daysCycleTime =
    workStartedAt && issue.resolutionDate
      ? daysBetween(workStartedAt, issue.resolutionDate)
      : null;

  const daysInProgress =
    workStartedAt && !issue.resolutionDate
      ? daysBetween(workStartedAt, nowIso)
      : null;

  return {
    ...issue,
    workStartedAt,
    daysCycleTime,
    daysInProgress,
  };
}

export async function enrichIssuesWithChangelog(
  issues: JiraIssue[],
): Promise<JiraIssue[]> {
  const changelogByKey = new Map<string, ChangelogHistory[]>();

  await runConcurrent(
    issues,
    async (issue) => {
      const histories = await fetchIssueChangelog(issue.key);
      changelogByKey.set(issue.key, histories);
    },
    CHANGELOG_CONCURRENCY,
  );

  return issues.map((issue) => {
    const histories = changelogByKey.get(issue.key) ?? [];
    const workStartedAt = extractWorkStartedAt(histories);
    return enrichIssueWithWorkDates(issue, workStartedAt);
  });
}
