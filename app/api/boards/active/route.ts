import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BOARD_COOKIE } from "@/lib/boards";

const COOKIE_OPTS = { path: "/", httpOnly: true, sameSite: "lax" as const, maxAge: 60 * 60 * 24 * 365 };

/** Switch which board you're looking at. `boardId: null` (or your own id) = your own. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const email = session.user.email;

  const body = await req.json().catch(() => ({}));
  const boardId = typeof body.boardId === "string" ? body.boardId : null;
  const res = NextResponse.json({ ok: true });

  const owner = boardId ? await prisma.user.findUnique({ where: { id: boardId }, select: { email: true } }) : null;
  if (!owner || owner.email === email) {
    res.cookies.delete(BOARD_COOKIE);
    return res;
  }
  const member = await prisma.boardMember.findUnique({
    where: { boardEmail_memberEmail: { boardEmail: owner.email, memberEmail: email } },
  });
  if (!member) return NextResponse.json({ error: "You aren't a member of that board." }, { status: 403 });
  res.cookies.set(BOARD_COOKIE, boardId!, COOKIE_OPTS);
  return res;
}
