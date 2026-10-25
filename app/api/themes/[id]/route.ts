import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Delete a theme you saved. People who already picked it keep their fonts
// and colors — those were copied into their own settings.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const theme = await prisma.theme.findUnique({ where: { id: params.id } });
  if (!theme) return NextResponse.json({ error: "Theme not found." }, { status: 404 });
  if (theme.ownerEmail !== email) {
    return NextResponse.json({ error: "You can only delete your own themes." }, { status: 403 });
  }

  await prisma.theme.delete({ where: { id: theme.id } });
  return NextResponse.json({ ok: true });
}
