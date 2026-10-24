import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { extractRecipeFromUrl, parseRecipeText } from "@/lib/importRecipe";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const text = typeof body.text === "string" ? body.text : "";

  if (!url && !text.trim()) {
    return NextResponse.json({ error: "Please provide a URL or paste some recipe text." }, { status: 400 });
  }

  const result = text.trim() ? parseRecipeText(text) : await extractRecipeFromUrl(url);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json(result.recipe);
}
