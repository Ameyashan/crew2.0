import { NextRequest } from "next/server";
import { runResumeTailorStream } from "@/lib/agents/resume-tailor";
import type { TailoredResume } from "@/lib/agents/resume-tailor/types";
import { supabaseAdmin } from "@/lib/supabase";
import { USER_ID } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const job_url = (body?.job_url ?? "").toString().trim();
  const highlights = body?.highlights ? body.highlights.toString() : undefined;
  const regenerate_notes = body?.regenerate_notes
    ? body.regenerate_notes.toString()
    : undefined;
  const pageRaw = Number(body?.page_count);
  const page_count: 1 | 2 = pageRaw === 2 ? 2 : 1;

  if (!job_url && !highlights?.trim()) {
    return Response.json(
      { error: "Provide a job URL or a description of how to change the resume" },
      { status: 400 }
    );
  }
  if (job_url && !/^https?:\/\//i.test(job_url)) {
    return Response.json({ error: "job_url must be http(s)" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let finalResume: TailoredResume | null = null;
      try {
        for await (const evt of runResumeTailorStream({
          job_url: job_url || undefined,
          highlights,
          page_count,
          regenerate_notes,
        })) {
          if (
            evt.type === "step" &&
            evt.id === "tailor" &&
            evt.status === "done"
          ) {
            finalResume = evt.data.resume;
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
        }

        if (finalResume) {
          try {
            const { data, error } = await supabaseAdmin()
              .from("resume_generations")
              .insert({
                user_id: USER_ID,
                job_url: job_url || null,
                highlights: highlights?.trim() || null,
                regenerate_notes: regenerate_notes?.trim() || null,
                page_count,
                target_role: finalResume.meta.target_role ?? null,
                target_company: finalResume.meta.target_company ?? null,
                model: finalResume.meta.model ?? null,
                resume: finalResume,
              })
              .select("id")
              .single();
            if (error) throw error;
            if (data?.id) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "saved", id: data.id })}\n\n`
                )
              );
            }
          } catch (e) {
            console.error("[resume_generations] insert failed", e);
          }
        }
      } catch (e) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message: String(e) })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
