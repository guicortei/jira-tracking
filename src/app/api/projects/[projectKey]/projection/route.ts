import {
  buildCheckoutProjections,
  isCheckoutProject,
} from "@/lib/jira/projection";
import { listIssues } from "@/lib/jira/client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ projectKey: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { projectKey } = await context.params;

  if (!isCheckoutProject(projectKey)) {
    return NextResponse.json(
      {
        error:
          "Projeção disponível apenas para o projeto Checkout TechTeam (CT).",
      },
      { status: 404 },
    );
  }

  try {
    const issues = await listIssues(projectKey);
    const projections = buildCheckoutProjections(issues);
    return NextResponse.json(projections);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao calcular projeção.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
