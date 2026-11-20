import { cookies } from "next/headers";
import { prisma } from "./prisma";

// Shared boards. A board is the plan, day notes and shopping-list checks stored
// under one person's email. You always have your own; you may also be a member
// of other people's. Which one you're looking at is a cookie holding the
// owner's user id — set by the switcher, and re-checked on every request, so a
// removed member silently falls back to their own board.

export const BOARD_COOKIE = "board";

export interface ActiveBoard {
  /** the email the board's rows are stored under */
  boardEmail: string;
  isOwn: boolean;
}

export async function getActiveBoard(viewerEmail: string): Promise<ActiveBoard> {
  const own: ActiveBoard = { boardEmail: viewerEmail, isOwn: true };
  let id: string | undefined;
  try {
    id = cookies().get(BOARD_COOKIE)?.value;
  } catch {
    return own; // not in a request scope
  }
  if (!id) return own;

  const owner = await prisma.user.findUnique({ where: { id }, select: { email: true } });
  if (!owner || owner.email === viewerEmail) return own;
  const membership = await prisma.boardMember.findUnique({
    where: { boardEmail_memberEmail: { boardEmail: owner.email, memberEmail: viewerEmail } },
  });
  return membership ? { boardEmail: owner.email, isOwn: false } : own;
}

export function inviteToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const INVITE_DAYS = 7;

/** What to call someone in the UI: their display name, else their email. */
export function personLabel(u: { displayName: string | null; email: string }): string {
  return u.displayName || u.email;
}
