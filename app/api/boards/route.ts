import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveBoard, personLabel } from "@/lib/boards";

/** Everything the board switcher and the Sharing settings need. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const email = session.user.email;

  const me = await prisma.user.findUnique({ where: { email }, select: { id: true, displayName: true } });
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const [joined, members, invite, active] = await Promise.all([
    prisma.boardMember.findMany({ where: { memberEmail: email }, orderBy: { createdAt: "asc" } }),
    prisma.boardMember.findMany({ where: { boardEmail: email }, orderBy: { createdAt: "asc" } }),
    prisma.boardInvite.findFirst({
      where: { boardEmail: email, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
    getActiveBoard(email),
  ]);

  const people = await prisma.user.findMany({
    where: { email: { in: [...joined.map((j) => j.boardEmail), ...members.map((m) => m.memberEmail)] } },
    select: { id: true, email: true, displayName: true },
  });
  const byEmail = new Map(people.map((p) => [p.email, p] as const));

  const boards = [
    { id: me.id, label: "My board", isOwn: true },
    ...joined.flatMap((j) => {
      const owner = byEmail.get(j.boardEmail);
      return owner ? [{ id: owner.id, label: `${personLabel(owner)}'s board`, isOwn: false }] : [];
    }),
  ];
  const activeId = active.isOwn ? me.id : byEmail.get(active.boardEmail)?.id ?? me.id;

  return NextResponse.json({
    me: { id: me.id, displayName: me.displayName ?? "" },
    boards,
    activeId,
    members: members.flatMap((m) => {
      const u = byEmail.get(m.memberEmail);
      return u ? [{ email: u.email, name: personLabel(u) }] : [];
    }),
    invite: invite ? { token: invite.token, expiresAt: invite.expiresAt.toISOString() } : null,
  });
}
