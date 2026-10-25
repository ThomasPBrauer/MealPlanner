import Link from "next/link";

// Shown (with a real 404 status) when a recipe doesn't exist or isn't
// visible to the viewer — personal recipes look exactly like missing ones.
export default function MealNotFound() {
  return (
    <main className="min-h-screen bg-board p-4 md:p-6">
      <div className="mx-auto max-w-2xl">
        <Link href="/meals" className="text-[12px] text-sage/80 hover:text-chalk">
          ← Back to meals
        </Link>
        <p className="mt-4 text-[13px] text-sage/70">
          That meal doesn&apos;t exist, or is personal to someone else.
        </p>
      </div>
    </main>
  );
}
