import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BUILT_IN_THEMES, ThemeSummary, parseThemeInput } from "@/lib/themes";
import { ThemeValues, rowToSummary, saveTheme } from "@/lib/themeStore";

// Every theme the signed-in user can pick: the built-in ones, then
// everyone's saved ones (alphabetical). Owner emails are never sent.
export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const rows = await prisma.theme.findMany({ orderBy: { name: "asc" }, take: 500 });

  const builtIn: ThemeSummary[] = BUILT_IN_THEMES.map((t) => ({
    id: `builtin:${t.name}`,
    name: t.name,
    builtIn: true,
    isMine: false,
    ownerName: null,
    displayFont: t.displayFont,
    bodyFont: t.bodyFont,
    colors: t.colors,
  }));

  return NextResponse.json({ themes: [...builtIn, ...rows.map((r) => rowToSummary(r, email))] });
}

// Save the posted fonts and colors as a shared theme: new name → created,
// the user's own name → overwritten, anyone else's name → 409.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = parseThemeInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await saveTheme(
    {
      findByKey: (nameKey) => prisma.theme.findUnique({ where: { nameKey } }),
      create: (values: ThemeValues) => prisma.theme.create({ data: values }),
      update: (id, values: ThemeValues) => prisma.theme.update({ where: { id }, data: values }),
    },
    { email, name: session.user?.name ?? null },
    parsed.name,
    parsed.data
  );

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

  return NextResponse.json(
    { status: result.status, theme: rowToSummary(result.row, email) },
    { status: result.status === "created" ? 201 : 200 }
  );
}
