import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("projects")
      .select("id, name, domain, status, completion, selected_strategy, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const getProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: project }, { data: messages }, { data: strategies }, { data: deliverables }] = await Promise.all([
      context.supabase.from("projects").select("*").eq("id", data.projectId).single(),
      context.supabase.from("messages").select("*").eq("project_id", data.projectId).order("created_at"),
      context.supabase.from("strategies").select("*").eq("project_id", data.projectId),
      context.supabase.from("deliverables").select("*").eq("project_id", data.projectId),
    ]);
    if (!project) throw new Error("Project not found");
    return { project, messages: messages ?? [], strategies: strategies ?? [], deliverables: deliverables ?? [] };
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("projects").delete().eq("id", data.projectId);
    return { ok: true };
  });
