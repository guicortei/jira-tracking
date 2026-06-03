function normalizeEnvValue(value?: string) {
  return value?.trim().replace(/^["']|["']$/g, "") ?? "";
}

function getJiraCredentials() {
  const email = normalizeEnvValue(process.env.JIRA_EMAIL);
  const apiKey = normalizeEnvValue(process.env.JIRA_API_KEY);
  const domain = normalizeEnvValue(process.env.JIRA_DOMAIN).replace(/\/$/, "");

  if (!email || !apiKey) {
    throw new Error(
      "Configure JIRA_EMAIL e JIRA_API_KEY no arquivo .env para conectar ao Jira.",
    );
  }

  if (!domain) {
    throw new Error(
      "Configure JIRA_DOMAIN no .env (ex: flowborder.atlassian.net).",
    );
  }

  return { email, apiKey, domain };
}

export function getSiteBaseUrl() {
  const { domain } = getJiraCredentials();

  if (domain.startsWith("http://") || domain.startsWith("https://")) {
    return domain.replace(/\/$/, "");
  }

  return `https://${domain}`;
}

function getAuthHeader() {
  const { email, apiKey } = getJiraCredentials();
  const token = Buffer.from(`${email}:${apiKey}`).toString("base64");
  return `Basic ${token}`;
}

export async function jiraFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Erro na API do Jira (${response.status}): ${body || response.statusText}`,
    );
  }

  return response.json() as Promise<T>;
}

export function daysBetween(start: string, end: string) {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  return Math.max(0, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)));
}
