import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listVisibleMeals } from "@/lib/meals";
import MealsBrowser from "@/components/MealsBrowser";

// reads the session (cookies) and the database on every request
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Recipes — The Weekly Board",
  description: "Browse the recipe box: public recipes anyone can read, plus your own meals when signed in.",
};

export default async function MealsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? undefined;
  const meals = await listVisibleMeals(email);
  const week = typeof searchParams.week === "string" ? searchParams.week : null;

  return <MealsBrowser initialMeals={meals} signedIn={!!email} email={email ?? null} weekParam={week} />;
}
