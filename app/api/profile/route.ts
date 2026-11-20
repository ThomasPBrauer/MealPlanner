import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cleanDisplayName, displayNameKey, validateDisplayName } from "@/lib/displayName";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { displayName: true },
  });
  return NextResponse.json({ displayName: user?.displayName ?? "" });
}

/** Sets (or, with an empty name, clears) the public display name. */
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.displayName === "string" ? cleanDisplayName(body.displayName) : "";

  if (!name) {
    await prisma.user.update({
      where: { email: session.user.email },
      data: { displayName: null, displayNameKey: null },
    });
    return NextResponse.json({ displayName: "" });
  }

  const problem = validateDisplayName(name);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const key = displayNameKey(name);
  const taken = await prisma.user.findFirst({
    where: { displayNameKey: key, NOT: { email: session.user.email } },
    select: { id: true },
  });
  if (taken) {
    return NextResponse.json({ error: "Someone is already using that name. Try another." }, { status: 409 });
  }

  try {
    await prisma.user.update({
      where: { email: session.user.email },
      data: { displayName: name, displayNameKey: key },
    });
  } catch {
    // lost a race with someone claiming it at the same moment (unique index)
    return NextResponse.json({ error: "Someone is already using that name. Try another." }, { status: 409 });
  }
  return NextResponse.json({ displayName: name });
}
