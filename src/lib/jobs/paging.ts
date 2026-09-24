// PostgREST caps every response at 1000 rows (Supabase's default max_rows),
// silently. With ~1.3k universe employers and a growing user base, list reads
// that must be complete page through with .range() via this helper.

const PAGE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

// `page(from, to)` must return a query with a stable .order() applied.
export async function selectAll<T>(page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}
