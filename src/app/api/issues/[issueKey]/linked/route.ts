import { listLinkedIssues } from "@/lib/jira/client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ issueKey: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { issueKey } = await context.params;

  try {
    const issues = await listLinkedIssues(issueKey);
    return NextResponse.json({ issues });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao buscar tickets vinculados.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
