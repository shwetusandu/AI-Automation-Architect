import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listProjects, deleteProject } from "@/lib/projects.functions";
import { startProject } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Plus, ArrowRight, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Projects — AI Automation Architect" }] }),
  component: Dashboard,
});

function Dashboard() {
  const listFn = useServerFn(listProjects);
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => listFn(),
  });
  const [showNew, setShowNew] = useState(false);

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="font-serif text-3xl tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your automation engagements.</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4" /> New solution
        </Button>
      </div>

      {showNew && <NewProjectCard onClose={() => setShowNew(false)} />}

      {isLoading ? (
        <div className="grid place-items-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : projects.length === 0 && !showNew ? (
        <EmptyState onStart={() => setShowNew(true)} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </main>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <Card className="grid place-items-center border-dashed py-24 text-center">
      <div className="max-w-sm">
        <h2 className="font-serif text-xl">No engagements yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Describe a business process and the consultant will start discovery.
        </p>
        <Button onClick={onStart} className="mt-6">
          <Plus className="h-4 w-4" /> Start new solution
        </Button>
      </div>
    </Card>
  );
}

function NewProjectCard({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const startFn = useServerFn(startProject);
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const mut = useMutation({
    mutationFn: (initialRequest: string) => startFn({ data: { initialRequest } }),
    onSuccess: ({ projectId }) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      navigate({ to: "/projects/$projectId", params: { projectId } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to start"),
  });

  return (
    <Card className="mb-6 p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-serif text-lg">New solution</h2>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        Describe the business process you want to automate. Be as specific as you can — the consultant will ask follow-ups.
      </p>
      <Textarea
        rows={5}
        placeholder="e.g. We receive ~80 candidate resumes per week via Gmail and need to score them, reject obvious mismatches, and route strong candidates to a HubSpot pipeline with a Slack alert to the recruiter."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-3 flex justify-end">
        <Button onClick={() => mut.mutate(text)} disabled={text.trim().length < 12 || mut.isPending}>
          {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Begin discovery
        </Button>
      </div>
    </Card>
  );
}

function ProjectCard({ project }: { project: { id: string; name: string; domain: string | null; status: string; completion: number; selected_strategy: string | null } }) {
  const qc = useQueryClient();
  const delFn = useServerFn(deleteProject);
  const del = useMutation({
    mutationFn: () => delFn({ data: { projectId: project.id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  return (
    <Card className="group p-5 transition hover:border-foreground/30">
      <div className="flex items-start justify-between">
        <Link to="/projects/$projectId" params={{ projectId: project.id }} className="flex-1">
          <div className="flex items-center gap-2">
            {project.domain && <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">{project.domain}</Badge>}
            <Badge variant="outline" className="text-[10px] capitalize">{project.status}</Badge>
          </div>
          <h3 className="mt-3 font-serif text-lg">{project.name}</h3>
        </Link>
        <button
          onClick={() => del.mutate()}
          className="opacity-0 transition group-hover:opacity-100 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4">
        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
          <span>Discovery</span>
          <span>{project.completion}%</span>
        </div>
        <Progress value={project.completion} className="h-1.5" />
      </div>
      <Link
        to="/projects/$projectId"
        params={{ projectId: project.id }}
        className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-foreground hover:text-accent"
      >
        Open workspace <ArrowRight className="h-3 w-3" />
      </Link>
    </Card>
  );
}
