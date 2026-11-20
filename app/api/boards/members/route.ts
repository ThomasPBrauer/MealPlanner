import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Owner removes a member (?email=…), or a member leaves a board (?board=<owner id>). */
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const me = session.user.email;

  const { searchParams } = new URL(req.url);
  const memberEmail = searchParams.get("email");
  const boardId = searchParams.get("board");

  if (memberEmail) {
    await prisma.boardMember.deleteMany({ where: { boardEmail: me, memberEmail } });
  } else if (boardId) {
    const owner = await prisma.user.findUnique({ where: { id: boardId }, select: { email: true } });
    if (owner) await prisma.boardMember.deleteMany({ where: { boardEmail: owner.email, memberEmail: me } });
  } else {
    return NextResponse.json({ error: "Say who to remove, or which board to leave." }, { status: 400 });
  }
  // the board cookie is re-checked on every request, so a stale one just falls back to your own
  return NextResponse.json({ ok: true });
}
