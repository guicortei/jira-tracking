import { listIssues } from "@/lib/jira/client";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ projectKey: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { projectKey } = await context.params;

  try {
    const issues = await listIssues(projectKey);
    return NextResponse.json({ issues });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao buscar tickets.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
