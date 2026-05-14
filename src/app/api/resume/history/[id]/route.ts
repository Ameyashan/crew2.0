import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { data, error } = await supabaseAdmin()
    .from("resume_generations")
    .select("*")
    .eq("user_id", USER_ID)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  return Response.json({ generation: data });
}
