import { listProjects } from "@/lib/jira/client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const projects = await listProjects();
    return NextResponse.json({ projects });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao buscar projetos.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
