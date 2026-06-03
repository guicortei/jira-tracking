export type JiraProject = {
  id: string;
  key: string;
  name: string;
  avatarUrl?: string;
  siteUrl: string;
};

export type JiraIssue = {
  id: string;
  key: string;
  summary: string;
  status: string;
  issueType: string;
  priority: string | null;
  assignee: string | null;
  projectKey: string;
  projectName: string;
  created: string;
  updated: string;
  resolutionDate: string | null;
  /** Lead time: created → resolution */
  daysToResolve: number | null;
  /** Quando o ticket saiu de "A Fazer" (via changelog) */
  workStartedAt: string | null;
  /** Cycle time: workStartedAt → resolution (tickets concluídos) */
  daysCycleTime: number | null;
  /** Dias desde workStartedAt (tickets em andamento) */
  daysInProgress: number | null;
  sprint: number | null;
};

export type JiraIssuesResponse = {
  issues: JiraIssue[];
};
