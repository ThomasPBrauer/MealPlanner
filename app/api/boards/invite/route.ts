import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INVITE_DAYS, inviteToken } from "@/lib/boards";

/** Makes a new invite link for your board (any earlier link stops working). */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const email = session.user.email;

  await prisma.boardInvite.updateMany({
    where: { boardEmail: email, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  const invite = await prisma.boardInvite.create({
    data: {
      boardEmail: email,
      token: inviteToken(),
      expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  return NextResponse.json({ token: invite.token, expiresAt: invite.expiresAt.toISOString() }, { status: 201 });
}

/** Turns the current invite link off. */
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  await prisma.boardInvite.updateMany({
    where: { boardEmail: session.user.email, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
