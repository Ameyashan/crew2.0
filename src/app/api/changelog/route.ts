import { getChangelog } from "@/lib/changelog";

export const runtime = "nodejs";
// Re-fetch from GitHub at most every 30 minutes; serve cached JSON otherwise.
export const revalidate = 1800;

// Public endpoint feeding the /changelog page. No auth — the changelog is meant
// to be seen by anyone curious about what we've shipped.
export async function GET() {
  const changelog = await getChangelog();
  return Response.json(changelog, {
    headers: {
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400",
    },
  });
}
