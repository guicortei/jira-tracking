import {
  AUTH_COOKIE_NAME,
  createSessionToken,
  getAuthCookieOptions,
  getAuthPassword,
  verifyPassword,
} from "@/lib/auth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    getAuthPassword();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Autenticação não configurada.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corpo da requisição inválido." },
      { status: 400 },
    );
  }

  const password = body.password?.trim() ?? "";
  if (!password) {
    return NextResponse.json(
      { error: "Informe a senha." },
      { status: 400 },
    );
  }

  const valid = await verifyPassword(password);
  if (!valid) {
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }

  const token = await createSessionToken(getAuthPassword());
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, getAuthCookieOptions());

  return NextResponse.json({ ok: true });
}
