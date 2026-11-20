import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BOARD_COOKIE, personLabel } from "@/lib/boards";

async function findInvite(token: string | null) {
  if (!token) return null;
  const invite = await prisma.boardInvite.findUnique({ where: { token } });
  if (!invite || invite.revokedAt || invite.expiresAt <= new Date()) return null;
  const owner = await prisma.user.findUnique({
    where: { email: invite.boardEmail },
    select: { id: true, email: true, displayName: true },
  });
  return owner ? { invite, owner } : null;
}

/** Who an invite link is from (so the join page can say "Join Sam's board?"). */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const found = await findInvite(new URL(req.url).searchParams.get("token"));
  if (!found) return NextResponse.json({ error: "This invite link has expired or been turned off." }, { status: 404 });
  return NextResponse.json({
    ownerName: personLabel(found.owner),
    isOwn: found.owner.email === session.user.email,
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const me = session.user.email;

  const body = await req.json().catch(() => ({}));
  const found = await findInvite(typeof body.token === "string" ? body.token : null);
  if (!found) return NextResponse.json({ error: "This invite link has expired or been turned off." }, { status: 404 });
  if (found.owner.email === me) {
    return NextResponse.json({ error: "That's your own board — send the link to someone else." }, { status: 400 });
  }

  await prisma.boardMember.upsert({
    where: { boardEmail_memberEmail: { boardEmail: found.owner.email, memberEmail: me } },
    create: { boardEmail: found.owner.email, memberEmail: me },
    update: {},
  });
  const res = NextResponse.json({ ok: true, ownerName: personLabel(found.owner) });
  res.cookies.set(BOARD_COOKIE, found.owner.id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
