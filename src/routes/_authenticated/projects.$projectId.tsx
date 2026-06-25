import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getProject } from "@/lib/projects.functions";
import { discoveryTurn, generateStrategies, selectStrategy, generateDeliverable } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, ArrowRight, Check, CircleAlert, CircleX, Loader2, Sparkles, Star, Briefcase, Network, Workflow, Bot, DollarSign, Map as MapIcon, FileText, ChevronDown, Copy, ChevronsUpDown, ChevronsDownUp, AlertTriangle, TrendingUp, Zap, Target, Clock, Gauge, ShieldAlert, Lightbulb, Wrench, Rocket, Brain } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import mermaid from "mermaid";
import { MindMap, buildMindMaps } from "@/components/MindMap";
import { BlueprintCodeModal } from "@/components/BlueprintCodeModal";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  component: ProjectWorkspace,
});

const PILLARS = [
  { key: "trigger", label: "Trigger" },
  { key: "input_source", label: "Input Source" },
  { key: "processing", label: "Processing" },
  { key: "decision_logic", label: "Decision Logic" },
  { key: "outputs", label: "Outputs" },
  { key: "notifications", label: "Notifications" },
  { key: "scale", label: "Scale" },
] as const;

function ProjectWorkspace() {
  const { projectId } = Route.useParams();
  const getFn = useServerFn(getProject);
  const { data, isLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getFn({ data: { projectId } }),
    refetchOnWindowFocus: false,
  });

  if (isLoading || !data) {
    return (
      <main className="grid place-items-center py-32 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </main>
    );
  }

  const { project } = data;
  const stage = project.selected_strategy ? "delivery" : (project.status === "strategy" || (data.strategies?.length ?? 0) > 0) ? "strategy" : "discovery";
  const mindMapUnlocked = (data.strategies?.length ?? 0) > 0;
  const [activeTab, setActiveTab] = useState<string>(stage);
  // Keep tab in sync when the underlying stage advances
  useEffect(() => { setActiveTab(stage); }, [stage]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <Link to="/dashboard" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> All projects
        </Link>
        <div className="flex items-center gap-2">
          {project.domain && <Badge variant="secondary" className="uppercase text-[10px] tracking-wide">{project.domain} · {Math.round(Number(project.domain_confidence ?? 0))}%</Badge>}
        </div>
      </div>
      <h1 className="font-serif text-3xl tracking-tight">{project.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{project.initial_request}</p>

      <div className="mt-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            <TabsTrigger value="discovery">1 · Discovery</TabsTrigger>
            <TabsTrigger value="strategy" disabled={stage === "discovery"}>2 · Strategy</TabsTrigger>
            <TabsTrigger value="mindmap" disabled={!mindMapUnlocked}>3 · Mind Map</TabsTrigger>
            <TabsTrigger value="delivery" disabled={stage !== "delivery"}>4 · Consultant Dashboard</TabsTrigger>
          </TabsList>

          <TabsContent value="discovery" className="mt-6">
            <DiscoveryView projectId={projectId} data={data} />
          </TabsContent>
          <TabsContent value="strategy" className="mt-6">
            <StrategyView projectId={projectId} data={data} />
          </TabsContent>
          <TabsContent value="mindmap" className="mt-6">
            <MindMapView data={data} />
          </TabsContent>
          <TabsContent value="delivery" className="mt-6">
            <DeliveryView projectId={projectId} data={data} />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

// ============ Mind Map ============
function MindMapView({ data }: { data: ProjectData }) {
  const selected = data.strategies.find((s) => s.tier === data.project.selected_strategy)
    ?? data.strategies.find((s) => s.tier === "recommended")
    ?? data.strategies[0];
  const byKind = new Map(data.deliverables.map((x) => [x.kind, x.data] as const));
  const { business, technical } = buildMindMaps(
    data.project as any,
    (selected?.data as any) ?? null,
    byKind as Map<string, unknown>,
  );
  return (
    <div className="space-y-4">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Mind Map</div>
        <h2 className="mt-0.5 font-serif text-2xl">Understand the automation in 30 seconds</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Two views of the same solution — switch between business outcomes and technical implementation. Expand any branch for detail; export to share with your team.
        </p>
      </div>
      <MindMap business={business} technical={technical} projectName={data.project.name ?? "project"} />
    </div>
  );
}

// ============ Discovery ============
type ProjectData = Awaited<ReturnType<typeof getProject>>;

function DiscoveryView({ projectId, data }: { projectId: string; data: ProjectData }) {
  const qc = useQueryClient();
  const turnFn = useServerFn(discoveryTurn);
  const genStratFn = useServerFn(generateStrategies);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const turn = useMutation({
    mutationFn: (userReply: string) => turnFn({ data: { projectId, userReply } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project", projectId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const genStrat = useMutation({
    mutationFn: () => genStratFn({ data: { projectId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project", projectId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [data.messages.length, turn.isPending]);

  function send(text: string) {
    if (!text.trim() || turn.isPending) return;
    setInput("");
    turn.mutate(text);
  }

  const lastAssistant = [...data.messages].reverse().find((m) => m.role === "assistant");
  const lastOptions = (lastAssistant?.options as any)?.choices as string[] | undefined;
  const completion = data.project.completion ?? 0;
  const reqs = (data.project.requirements as Record<string, string | null>) ?? {};

  const pillarIcons: Record<string, any> = {
    trigger: Zap,
    input_source: FileText,
    processing: Workflow,
    decision_logic: Brain,
    outputs: Rocket,
    notifications: Sparkles,
    scale: Gauge,
  };
  const okCount = PILLARS.filter((p) => (reqs[p.key]?.length ?? 0) > 30).length;
  const partialCount = PILLARS.filter((p) => { const v = reqs[p.key]; return v && v.length > 0 && v.length <= 30; }).length;
  const missingCount = PILLARS.length - okCount - partialCount;
  const ready = completion >= 85;

  // Structured input chip groups — guide the user to disambiguate common discovery dimensions
  const CHIP_GROUPS: { key: string; label: string; Icon: any; chips: string[] }[] = [
    { key: "industry", label: "Industry", Icon: Briefcase, chips: ["SaaS", "E‑commerce", "Healthcare", "Finance", "Real Estate", "Education", "Logistics"] },
    { key: "system", label: "System / Tool", Icon: Network, chips: ["HubSpot", "Salesforce", "Notion", "Airtable", "Slack", "Gmail", "Stripe", "Shopify"] },
    { key: "users", label: "Users", Icon: Target, chips: ["Sales team", "Ops team", "Support", "Customers", "Internal admins", "Leadership"] },
    { key: "triggers", label: "Trigger", Icon: Zap, chips: ["New form submission", "Email received", "Schedule (daily)", "Webhook", "Record updated", "Manual run"] },
  ];
  const [openChipGroup, setOpenChipGroup] = useState<string | null>("industry");
  function appendChip(text: string) {
    setInput((prev) => {
      const trimmed = prev.trimEnd();
      return trimmed ? `${trimmed}, ${text}` : text;
    });
  }

  // Live architecture preview: derive nodes from captured requirements
  const archNodes = [
    { key: "trigger", label: "Trigger", Icon: Zap },
    { key: "input_source", label: "Input", Icon: FileText },
    { key: "processing", label: "Processing", Icon: Workflow },
    { key: "decision_logic", label: "Logic", Icon: Brain },
    { key: "outputs", label: "Output", Icon: Rocket },
    { key: "notifications", label: "Notify", Icon: Sparkles },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Hero progress band */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-accent/5 to-transparent p-6">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Stage 1 · Discovery</div>
            <h2 className="mt-1 font-serif text-2xl tracking-tight">Let's map your automation</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Answer a few targeted questions. Once we've covered ~85% of the pillars, we'll generate three tailored strategies.
            </p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Completion</div>
              <div className="font-serif text-4xl leading-none">{completion}<span className="text-xl text-muted-foreground">%</span></div>
            </div>
            <div className="flex gap-2">
              <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-center">
                <div className="text-base font-semibold text-success">{okCount}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Done</div>
              </div>
              <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-center">
                <div className="text-base font-semibold text-warning">{partialCount}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Partial</div>
              </div>
              <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-center">
                <div className="text-base font-semibold text-muted-foreground">{missingCount}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Open</div>
              </div>
            </div>
          </div>
        </div>
        <Progress value={completion} className="relative mt-5 h-1.5" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Chat + Generate CTA */}
        <div className="space-y-4">
          <Card className="flex h-[620px] flex-col overflow-hidden border-border/70 shadow-sm">
            <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-5 py-3">
              <div className="flex items-center gap-2">
                <div className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <div>
                  <div className="text-sm font-medium leading-tight">AI Consultant</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Discovery interview</div>
                </div>
              </div>
              <Badge variant="secondary" className="text-[10px]">{data.messages.length} msgs</Badge>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-6">
              {data.messages.map((m) => (
                <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start gap-2"}>
                  {m.role !== "user" && (
                    <div className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                      <Sparkles className="h-3 w-3" />
                    </div>
                  )}
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm"
                        : "max-w-[85%] rounded-2xl rounded-tl-sm border border-border/60 bg-card px-4 py-3 text-sm shadow-sm"
                    }
                  >
                    <div className="prose prose-sm max-w-none prose-p:my-1 prose-strong:text-foreground">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}
              {turn.isPending && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
                  <span className="flex gap-1" aria-hidden="true">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary motion-reduce:animate-none [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary motion-reduce:animate-none [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary motion-reduce:animate-none" />
                  </span>
                  Consultant is thinking…
                </div>
              )}
            </div>

            {lastOptions && lastOptions.length > 0 && !turn.isPending && (
              <div className="border-t border-border/60 bg-muted/20 px-6 py-3">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <Lightbulb className="h-3 w-3" aria-hidden="true" /> Quick answers
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Quick answer suggestions">
                  {lastOptions.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => send(opt)}
                      className="rounded-full border border-border bg-background px-3 py-1 text-xs transition hover:-translate-y-px hover:border-primary hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Structured input chips — guide users to disambiguate */}
            <div className="border-t border-border/60 bg-background px-5 py-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                <Target className="h-3 w-3" aria-hidden="true" /> Add structured detail
              </div>
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Detail categories">
                {CHIP_GROUPS.map((g) => {
                  const active = openChipGroup === g.key;
                  return (
                    <button
                      key={g.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setOpenChipGroup(active ? null : g.key)}
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground hover:border-primary/60 hover:text-primary"}`}
                    >
                      <g.Icon className="h-3 w-3" aria-hidden="true" />
                      {g.label}
                    </button>
                  );
                })}
              </div>
              {openChipGroup && (
                <div className="mt-2 flex flex-wrap gap-1.5" role="tabpanel" aria-label={`${openChipGroup} suggestions`}>
                  {CHIP_GROUPS.find((g) => g.key === openChipGroup)?.chips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => appendChip(chip)}
                      className="rounded-full border border-dashed border-border bg-muted/30 px-2.5 py-0.5 text-[11px] text-foreground transition hover:border-primary hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                    >
                      + {chip}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-border/60 bg-card p-4">
              <label htmlFor="discovery-input" className="sr-only">Your answer</label>
              <div className="flex gap-2">
                <Textarea
                  id="discovery-input"
                  rows={2}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  placeholder="Type your answer, pick a quick answer above, or add detail chips…"
                  className="resize-none border-border/70 focus-visible:ring-primary/40"
                  aria-label="Your answer to the consultant"
                />
                <Button
                  onClick={() => send(input)}
                  disabled={!input.trim() || turn.isPending}
                  className="self-stretch px-4"
                  aria-label="Send answer"
                >
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              <div className="mt-2 text-[10px] text-muted-foreground">Press Enter to send · Shift+Enter for newline</div>
            </div>
          </Card>

          <Card className={`relative overflow-hidden border-border/70 p-5 ${ready ? "bg-gradient-to-br from-primary/15 via-accent/10 to-transparent" : ""}`}>
            {ready && <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/20 blur-2xl" />}
            <div className="relative">
              <div className="flex items-center gap-2">
                <div className={`grid h-8 w-8 place-items-center rounded-lg ${ready ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold leading-tight">Generate strategies</h3>
                  <div className="text-[11px] text-muted-foreground">{ready ? "Ready to go" : `Unlocks at 85% · ${85 - completion}% to go`}</div>
                </div>
              </div>
              <Button
                className="mt-4 w-full"
                disabled={!ready || genStrat.isPending}
                onClick={() => genStrat.mutate()}
              >
                {genStrat.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate 3 approaches
              </Button>
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          {/* Live mini architecture preview */}
          <Card className="overflow-hidden border-border/70" aria-label="Live architecture preview">
            <div className="flex items-center justify-between border-b border-border/60 bg-gradient-to-r from-primary/10 to-transparent px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="grid h-6 w-6 place-items-center rounded-md bg-primary/15 text-primary">
                  <Network className="h-3 w-3" aria-hidden="true" />
                </div>
                <h3 className="text-sm font-semibold leading-tight">Live Architecture</h3>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground" aria-live="polite">
                {okCount + partialCount}/{archNodes.length} mapped
              </span>
            </div>
            <ol className="space-y-1.5 p-4" aria-label="Pipeline stages">
              {archNodes.map((node, i) => {
                const v = reqs[node.key];
                const captured = v && v.length > 0;
                const strong = v && v.length > 30;
                const tone = strong
                  ? "border-success/40 bg-success/10 text-success-foreground"
                  : captured
                  ? "border-warning/40 bg-warning/10 text-warning-foreground"
                  : "border-dashed border-border bg-muted/30 text-muted-foreground";
                const dotTone = strong ? "bg-success" : captured ? "bg-warning" : "bg-muted-foreground/40";
                return (
                  <li key={node.key} className="relative">
                    <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition motion-reduce:transition-none ${tone}`}>
                      <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotTone}`} aria-hidden="true" />
                      <node.Icon className="h-3.5 w-3.5 shrink-0 text-foreground/70" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-foreground">{node.label}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {captured ? v : <span className="italic">Not captured yet</span>}
                        </div>
                      </div>
                    </div>
                    {i < archNodes.length - 1 && (
                      <div className="ml-3 h-2 w-px bg-border" aria-hidden="true" />
                    )}
                  </li>
                );
              })}
            </ol>
          </Card>

          <Card className="overflow-hidden border-border/70">
            <div className="border-b border-border/60 bg-muted/30 px-4 py-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Discovery Pillars</h3>
                <span className="text-[11px] text-muted-foreground">{okCount}/{PILLARS.length}</span>
              </div>
            </div>
            <ul className="divide-y divide-border/50">
              {PILLARS.map((p) => {
                const v = reqs[p.key];
                const state = v && v.length > 30 ? "ok" : v && v.length > 0 ? "partial" : "missing";
                const Icon = pillarIcons[p.key] ?? Target;
                const tone =
                  state === "ok" ? "border-success/30 bg-success/10 text-success" :
                  state === "partial" ? "border-warning/30 bg-warning/10 text-warning" :
                  "border-border bg-muted/40 text-muted-foreground";
                return (
                  <li key={p.key} className="flex items-start gap-3 px-4 py-3 transition hover:bg-muted/30">
                    <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${tone}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">{p.label}</div>
                        {state === "ok" ? <Check className="h-3.5 w-3.5 text-success" /> :
                          state === "partial" ? <CircleAlert className="h-3.5 w-3.5 text-warning" /> :
                          <CircleX className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
                      </div>
                      {v && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{v}</div>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}

// ============ Strategy ============
function StrategyView({ projectId, data }: { projectId: string; data: ProjectData }) {
  const qc = useQueryClient();
  const selectFn = useServerFn(selectStrategy);
  const select = useMutation({
    mutationFn: (tier: "budget" | "recommended" | "enterprise") => selectFn({ data: { projectId, tier } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project", projectId] }),
  });

  const order = ["budget", "recommended", "enterprise"] as const;
  const strategies = order
    .map((t) => data.strategies.find((s) => s.tier === t))
    .filter(Boolean) as typeof data.strategies;

  return (
    <div className="grid gap-5 md:grid-cols-3">
      {strategies.map((s) => {
        const d = s.data as any;
        const isRec = s.tier === "recommended";
        return (
          <Card key={s.id} className={`flex flex-col p-6 ${isRec ? "border-accent ring-1 ring-accent/30" : ""}`}>
            <div className="flex items-center justify-between">
              <Badge variant={isRec ? "default" : "outline"} className="capitalize">
                {isRec && <Star className="h-3 w-3" />}
                {s.tier}
              </Badge>
              {isRec && <span className="text-[10px] uppercase tracking-wide text-accent">Recommended</span>}
            </div>
            <h3 className="mt-3 font-serif text-xl">{d.headline}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{d.summary}</p>

            <div className="my-5 border-y border-border py-4">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Monthly</div>
              <div className="font-serif text-3xl">${d.monthly_cost_usd?.toLocaleString()}</div>
              <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                <span>Complexity: <span className="text-foreground">{d.complexity}</span></span>
                <span>Scale: <span className="text-foreground">{d.scalability}</span></span>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Stack</div>
                <div className="flex flex-wrap gap-1">
                  {d.stack?.map((t: string) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                </div>
              </div>
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wide text-success">Pros</div>
                <ul className="space-y-0.5 text-xs">
                  {d.pros?.map((p: string) => <li key={p}>+ {p}</li>)}
                </ul>
              </div>
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wide text-destructive">Cons</div>
                <ul className="space-y-0.5 text-xs">
                  {d.cons?.map((p: string) => <li key={p}>− {p}</li>)}
                </ul>
              </div>
            </div>

            <Button
              className="mt-6"
              variant={isRec ? "default" : "outline"}
              onClick={() => select.mutate(s.tier as any)}
              disabled={select.isPending}
            >
              Select {s.tier}
            </Button>
          </Card>
        );
      })}
    </div>
  );
}

// ============ Delivery ============
const DELIVERABLE_META: Record<string, { label: string; desc: string }> = {
  business_analysis: { label: "Business Analysis", desc: "Problem, solution, value, risks." },
  architecture: { label: "Solution Architecture", desc: "Components, data flow, integrations." },
  ai_agents: { label: "AI Agent Design", desc: "Per-agent purpose, IO, prompt strategy." },
  make_workflow: { label: "Detailed Module Spec", desc: "Module-by-module mappings, filters, error handling." },
  make_blueprint: { label: "Scenario Blueprint", desc: "Visual flow with routers, filters, data stores, approvals." },
  api_recommendations: { label: "API Recommendations", desc: "Per-API rationale, auth, alternatives, cost, risks." },
  cost_estimate: { label: "Cost Estimate", desc: "Volume-based pricing across low / medium / high." },
  readiness_score: { label: "Implementation Readiness", desc: "Score with per-factor breakdown, gaps, next steps." },
  consultant_recommendations: { label: "Consultant Recommendations", desc: "Key risks, improvements, quick wins, tech debt." },
  roadmap: { label: "Implementation Roadmap", desc: "Phases, milestones, dependencies." },
  proposal: { label: "Client Proposal", desc: "Scope, timeline, success metrics." },
};

const SECTIONS: Array<{
  key: string;
  label: string;
  blurb: string;
  Icon: typeof Briefcase;
  accent: string;
  items: string[];
}> = [
  { key: "executive", label: "Executive Summary", blurb: "Problem, solution, business value, risks.", Icon: Briefcase, accent: "text-blue-500 bg-blue-500/10 border-blue-500/30", items: ["business_analysis"] },
  { key: "architecture", label: "Architecture", blurb: "Diagram, data flow, systems, integrations.", Icon: Network, accent: "text-violet-500 bg-violet-500/10 border-violet-500/30", items: ["architecture"] },
  { key: "make", label: "Workflow Design", blurb: "Detailed execution blueprint outlining workflow modules, decision logic, data handling, approvals, integrations, and exception paths. Designed for implementation across Make.com, n8n, and enterprise automation platforms.", Icon: Workflow, accent: "text-amber-500 bg-amber-500/10 border-amber-500/30", items: ["make_blueprint", "make_workflow"] },
  { key: "agents", label: "AI Agents", blurb: "Agent cards: purpose, inputs, outputs, prompts.", Icon: Bot, accent: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30", items: ["ai_agents"] },
  { key: "cost", label: "Cost", blurb: "Volume-based estimates and API economics.", Icon: DollarSign, accent: "text-cyan-500 bg-cyan-500/10 border-cyan-500/30", items: ["cost_estimate", "api_recommendations"] },
  { key: "roadmap", label: "Roadmap & Readiness", blurb: "Phases, dependencies, readiness, consultant memo.", Icon: MapIcon, accent: "text-rose-500 bg-rose-500/10 border-rose-500/30", items: ["roadmap", "readiness_score", "consultant_recommendations"] },
  { key: "proposal", label: "Proposal", blurb: "Client-facing scope, timeline, success metrics.", Icon: FileText, accent: "text-slate-300 bg-slate-500/10 border-slate-500/30", items: ["proposal"] },
];

function DeliveryView({ projectId, data }: { projectId: string; data: ProjectData }) {
  const qc = useQueryClient();
  const recStrategy = data.strategies.find((s) => s.tier === data.project.selected_strategy);
  const recD = recStrategy?.data as any;
  const byKind = new Map(data.deliverables.map((x) => [x.kind, x.data] as const));
  const [activeSection, setActiveSection] = useState(SECTIONS[0].key);
  const genFn = useServerFn(generateDeliverable);

  const active = SECTIONS.find((s) => s.key === activeSection) ?? SECTIONS[0];
  const allKinds = SECTIONS.flatMap((s) => s.items);
  const generatedKinds = allKinds.filter((k) => byKind.has(k));
  const allGenerated = generatedKinds.length === allKinds.length;

  const generateAll = useMutation({
    mutationFn: async () => {
      await Promise.all(
        allKinds.map((kind) => genFn({ data: { projectId, kind: kind as any } }).catch(() => null)),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      toast.success("All deliverables generated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });


  const readinessData = byKind.get("readiness_score") as any;
  const roadmapData = byKind.get("roadmap") as any;
  const recsData = byKind.get("consultant_recommendations") as any;
  const readinessScore = Math.round(readinessData?.overall_score ?? 0);
  const timelineWeeks = (() => {
    const phases = roadmapData?.phases ?? [];
    if (!phases.length) return null;
    const totalWeeks = phases.reduce((acc: number, p: any) => {
      const m = String(p.duration ?? "").match(/(\d+)\s*(week|wk|day|month|mo)?/i);
      if (!m) return acc;
      const n = Number(m[1]);
      const unit = (m[2] || "week").toLowerCase();
      if (unit.startsWith("day")) return acc + n / 7;
      if (unit.startsWith("mo")) return acc + n * 4;
      return acc + n;
    }, 0);
    return totalWeeks ? `${Math.round(totalWeeks)} Weeks` : null;
  })();
  const riskLevel = (() => {
    const risks = recsData?.key_risks ?? [];
    if (!risks.length) return null;
    const has = (lvl: string) => risks.some((r: any) => String(r.impact ?? "").toLowerCase().includes(lvl));
    if (has("high")) return "High";
    if (has("med")) return "Medium";
    return "Low";
  })();

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Executive dashboard</div>
            <h2 className="mt-0.5 font-serif text-2xl">{(data.project as any).title || data.project.name || "Project"}</h2>
            {recD?.summary && (
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground line-clamp-2">{recD.summary}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="capitalize">{data.project.selected_strategy} strategy</Badge>
            <Button size="sm" onClick={() => generateAll.mutate()} disabled={generateAll.isPending}>
              {generateAll.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
              {allGenerated ? "Regenerate all" : "Generate all"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiTile Icon={DollarSign} label="Est. Monthly" value={recD?.monthly_cost_usd != null ? `$${Number(recD.monthly_cost_usd).toLocaleString()}` : "—"} tone="cyan" />
          <KpiTile Icon={Gauge} label="Readiness" value={readinessScore ? `${readinessScore}%` : "—"} tone={readinessScore >= 85 ? "emerald" : readinessScore >= 70 ? "amber" : readinessScore ? "rose" : "muted"} />
          <KpiTile Icon={Clock} label="Timeline" value={timelineWeeks ?? "—"} tone="violet" />
          <KpiTile Icon={ShieldAlert} label="Risk" value={riskLevel ?? "—"} tone={riskLevel === "High" ? "rose" : riskLevel === "Medium" ? "amber" : riskLevel ? "emerald" : "muted"} />
          <KpiTile Icon={Target} label="Complexity" value={recD?.complexity ?? "—"} tone="amber" />
          <KpiTile Icon={TrendingUp} label="Scalability" value={recD?.scalability ?? "—"} tone="emerald" />
        </div>
      </div>

      {/* Sidebar + content layout */}
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Left sidebar */}
        <aside className="h-fit space-y-1 rounded-xl border border-border bg-card p-3">
          <div className="mb-2 px-2 pt-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Sections</div>
          </div>
          {SECTIONS.map((s) => {
            const generatedCount = s.items.filter((k) => byKind.has(k)).length;
            const total = s.items.length;
            const sectionAllGenerated = generatedCount === total;
            const someGenerated = generatedCount > 0;
            const isActive = activeSection === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setActiveSection(s.key)}
                className={`flex w-full items-center gap-3 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                  isActive ? `bg-muted ${s.accent.split(" ")[2]}` : "border-transparent hover:bg-muted/50"
                }`}
              >
                <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border ${s.accent}`}>
                  <s.Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-sm font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${sectionAllGenerated ? "bg-emerald-500" : someGenerated ? "bg-amber-500" : "bg-muted-foreground/30"}`} />
                    <span className="text-[10px] text-muted-foreground">
                      {sectionAllGenerated ? "Ready" : someGenerated ? `${generatedCount}/${total}` : "Pending"}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </aside>

        {/* Active section panel */}
        <section className="min-w-0">
          <div className="mb-4 flex items-center gap-3">
            <div className={`grid h-10 w-10 place-items-center rounded-lg border ${active.accent}`}>
              <active.Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-serif text-xl">{active.label}</h2>
              <p className="text-xs text-muted-foreground">{active.blurb}</p>
            </div>
          </div>
          <div className="space-y-4">
            {active.items.map((kind) => (
              <DeliverableBlock
                key={kind}
                projectId={projectId}
                kind={kind}
                label={DELIVERABLE_META[kind]?.label ?? kind}
                desc={DELIVERABLE_META[kind]?.desc ?? ""}
                existing={byKind.get(kind)}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

const TONE_MAP: Record<string, string> = {
  emerald: "text-emerald-500 border-emerald-500/30 bg-emerald-500/5",
  amber: "text-amber-500 border-amber-500/30 bg-amber-500/5",
  rose: "text-rose-500 border-rose-500/30 bg-rose-500/5",
  violet: "text-violet-500 border-violet-500/30 bg-violet-500/5",
  cyan: "text-cyan-500 border-cyan-500/30 bg-cyan-500/5",
  blue: "text-blue-500 border-blue-500/30 bg-blue-500/5",
  muted: "text-muted-foreground border-border bg-muted/30",
};

function KpiTile({ Icon, label, value, tone = "muted" }: { Icon: typeof DollarSign; label: string; value: string | number; tone?: string }) {
  const cls = TONE_MAP[tone] ?? TONE_MAP.muted;
  return (
    <div className={`rounded-xl border ${cls.split(" ")[1]} bg-card p-3.5`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <div className={`grid h-6 w-6 place-items-center rounded-md border ${cls}`}>
          <Icon className="h-3 w-3" />
        </div>
      </div>
      <div className="mt-2 font-serif text-xl capitalize">{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-serif text-lg">{value}</div>
    </div>
  );
}

function DeliverableBlock({
  kind, label, desc, existing,
}: { projectId: string; kind: string; label: string; desc: string; existing: any }) {
  const [open, setOpen] = useState(true);
  const [codeOpen, setCodeOpen] = useState(false);
  const isBlueprint = kind === "make_blueprint";
  const copy = () => {
    try {
      navigator.clipboard.writeText(JSON.stringify(existing, null, 2));
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex w-full items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
        >
          <div className="min-w-0">
            <h3 className="truncate font-serif text-sm">{label}</h3>
            {desc && <p className="mt-0.5 truncate text-xs text-muted-foreground">{desc}</p>}
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          {isBlueprint && existing && (
            <button
              onClick={(e) => { e.stopPropagation(); setCodeOpen(true); }}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 text-[11px] font-medium text-amber-600 hover:bg-amber-500/20 dark:text-amber-400"
              aria-label="View blueprint code"
            >
              <FileText className="h-3 w-3" /> Code
            </button>
          )}
          {existing && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); copy(); }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Copy JSON"
            >
              <Copy className="h-3 w-3" />
            </span>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Collapse" : "Expand"}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>
      {isBlueprint && (
        <BlueprintCodeModal
          open={codeOpen}
          onOpenChange={setCodeOpen}
          blueprint={existing}
          scenarioName={existing?.scenario_name}
        />
      )}
      {open && (
        <div className="px-4 py-4">
          {existing ? (
            <DeliverableContent kind={kind} data={existing} />
          ) : (
            <div className="grid place-items-center gap-2 py-8 text-center">
              <div className="text-xs text-muted-foreground">Not generated yet</div>
              <div className="text-[11px] text-muted-foreground/70">Use "Generate all" to produce this artifact.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function DeliverableContent({ kind, data }: { kind: string; data: any }) {
  switch (kind) {
    case "business_analysis":
      return (
        <div className="space-y-5 text-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <StateCard tone="rose" Icon={AlertTriangle} label="Current state" body={data.current_state} />
            <StateCard tone="emerald" Icon={Rocket} label="Future state" body={data.future_state} />
          </div>
          <ColorCardGrid
            title="Pain points"
            tone="rose"
            Icon={AlertTriangle}
            items={data.pain_points}
          />
          <ColorCardGrid
            title="Automation opportunities"
            tone="emerald"
            Icon={Zap}
            items={data.automation_opportunities}
          />
          <ColorCardGrid
            title="Risks"
            tone="amber"
            Icon={ShieldAlert}
            items={data.risks}
          />
          {Array.isArray(data.assumptions) && data.assumptions.length > 0 && (
            <details className="rounded-lg border border-border bg-muted/20 p-3 text-xs">
              <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-muted-foreground">Assumptions ({data.assumptions.length})</summary>
              <ul className="mt-2 space-y-1 pl-1">
                {data.assumptions.map((a: string, i: number) => <li key={i} className="flex gap-2"><span className="text-muted-foreground">·</span>{a}</li>)}
              </ul>
            </details>
          )}
        </div>
      );
    case "architecture":
      return (
        <div className="space-y-5 text-sm">
          {/* Visual component flow */}
          {Array.isArray(data.components) && data.components.length > 0 && (
            <div>
              <SectionHeader Icon={Network} tone="violet" label="System components" count={data.components.length} />
              <div className="rounded-xl border border-border bg-muted/10 p-4">
                <div className="flex flex-col items-center gap-0">
                  {data.components.map((c: any, i: number) => (
                    <div key={i} className="flex w-full flex-col items-center">
                      <div className="w-full max-w-md rounded-lg border-2 border-violet-500/30 bg-card p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-medium">{c.name}</div>
                          {c.technology && <span className="shrink-0 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{c.technology}</span>}
                        </div>
                        {c.responsibility && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{c.responsibility}</p>}
                      </div>
                      {i < data.components.length - 1 && (
                        <div className="flex flex-col items-center" aria-hidden="true">
                          <div className="h-4 w-px bg-border" />
                          <ChevronDown className="-mt-1 h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {data.data_flow && (
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3">
              <div className="text-[11px] uppercase tracking-wider text-cyan-500">Data flow</div>
              <p className="mt-1 text-sm leading-relaxed">{data.data_flow}</p>
            </div>
          )}

          {data.data_storage && (
            <div>
              <SectionHeader Icon={Network} tone="cyan" label="Data storage" />
              <div className="grid gap-2 sm:grid-cols-2">
                {(["primary", "secondary", "retention", "pii_handling"] as const).map((k) =>
                  data.data_storage[k] ? (
                    <div key={k} className="rounded-lg border border-border bg-card p-3">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k.replace("_", " ")}</div>
                      <div className="mt-0.5 text-xs">{data.data_storage[k]}</div>
                    </div>
                  ) : null,
                )}
              </div>
            </div>
          )}

          {data.integration_points?.length > 0 && (
            <details open className="rounded-lg border border-border">
              <summary className="cursor-pointer px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                Integration points ({data.integration_points.length})
              </summary>
              <div className="grid gap-2 p-3 pt-0 md:grid-cols-2">
                {data.integration_points.map((p: any, i: number) => (
                  <div key={i} className="rounded-lg border border-border bg-card p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{p.system}</div>
                      <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">{p.direction}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {p.method && <span className="rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[10px]">{p.method}</span>}
                      {p.auth && <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-500">{p.auth}</span>}
                    </div>
                    {p.notes && <p className="mt-1 text-muted-foreground line-clamp-2">{p.notes}</p>}
                  </div>
                ))}
              </div>
            </details>
          )}

          {data.failure_points?.length > 0 && (
            <details className="rounded-lg border border-border">
              <summary className="cursor-pointer px-3 py-2 text-[11px] uppercase tracking-wider text-rose-500">
                Failure points ({data.failure_points.length})
              </summary>
              <div className="space-y-2 p-3 pt-0">
                {data.failure_points.map((f: any, i: number) => (
                  <div key={i} className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium">{f.point}</div>
                      {f.impact && <span className="shrink-0 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-500">{f.impact}</span>}
                    </div>
                    {f.mitigation && <p className="mt-1 text-muted-foreground"><span className="font-medium text-foreground">Mitigation:</span> {f.mitigation}</p>}
                  </div>
                ))}
              </div>
            </details>
          )}

          {(data.authentication?.length > 0 || data.recovery_strategy || data.scalability?.length || data.security?.length) && (
            <details className="rounded-lg border border-border">
              <summary className="cursor-pointer px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                Authentication, scaling, security, recovery
              </summary>
              <div className="space-y-3 p-3 pt-0 text-xs">
                {data.authentication?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {data.authentication.map((a: any, i: number) => (
                      <span key={i} className="rounded-md border border-border bg-muted/40 px-2 py-1">
                        <span className="font-medium">{a.actor}:</span> <span className="text-muted-foreground">{a.method}</span>
                      </span>
                    ))}
                  </div>
                )}
                {data.recovery_strategy && (
                  <div className="rounded border border-border bg-muted/30 p-2">
                    <div className="text-[10px] uppercase text-muted-foreground">Recovery strategy</div>
                    <div className="mt-0.5">{data.recovery_strategy}</div>
                  </div>
                )}
                <div className="grid gap-2 md:grid-cols-2">
                  <ColorCardGrid title="Scalability" tone="emerald" Icon={TrendingUp} items={data.scalability} compact />
                  <ColorCardGrid title="Security" tone="blue" Icon={ShieldAlert} items={data.security} compact />
                </div>
              </div>
            </details>
          )}

          {data.mermaid && (
            <details className="rounded-lg border border-border">
              <summary className="cursor-pointer px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">Diagram</summary>
              <div className="p-3 pt-0"><Mermaid chart={data.mermaid} /></div>
            </details>
          )}
        </div>
      );
    case "ai_agents":
      return (
        <div className="space-y-3 text-sm">
          <SectionHeader Icon={Bot} tone="emerald" label="AI agents" count={data.agents?.length ?? 0} />
          <div className="grid gap-3 md:grid-cols-2">
            {data.agents?.map((a: any, idx: number) => (
              <div key={idx} className="flex flex-col rounded-xl border border-emerald-500/30 bg-card p-4">
                <div className="flex items-start gap-2">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-500">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{a.name}</div>
                    {a.purpose && <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{a.purpose}</div>}
                  </div>
                </div>

                {a.trigger && (
                  <div className="mt-3 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px]">
                    <span className="text-muted-foreground">Trigger:</span> {a.trigger}
                  </div>
                )}

                <div className="mt-3 grid gap-2">
                  {Array.isArray(a.inputs) && a.inputs.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Inputs</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {a.inputs.map((it: string, i: number) => (
                          <span key={i} className="rounded-md border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 font-mono text-[10px] text-blue-500">{it}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {Array.isArray(a.outputs) && a.outputs.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Outputs</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {a.outputs.map((it: string, i: number) => (
                          <span key={i} className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-500">{it}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  {a.failure_handling && (
                    <div className="rounded border border-rose-500/30 bg-rose-500/5 p-2">
                      <div className="text-[10px] uppercase tracking-wide text-rose-500">Failure</div>
                      <div className="mt-0.5 line-clamp-3">{a.failure_handling}</div>
                    </div>
                  )}
                  {a.human_escalation && (
                    <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2">
                      <div className="text-[10px] uppercase tracking-wide text-amber-500">Escalation</div>
                      <div className="mt-0.5 line-clamp-3">{a.human_escalation}</div>
                    </div>
                  )}
                </div>

                {(a.prompt_strategy || (a.decision_logic?.length > 0) || a.example_prompt) && (
                  <details className="mt-3 rounded-lg border border-border bg-muted/20">
                    <summary className="cursor-pointer px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">Prompt & logic</summary>
                    <div className="space-y-2 p-3 pt-0 text-xs">
                      {a.prompt_strategy && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Strategy</div>
                          <div className="mt-0.5">{a.prompt_strategy}</div>
                        </div>
                      )}
                      {a.decision_logic?.length > 0 && (
                        <ul className="space-y-1">
                          {a.decision_logic.map((d: string, i: number) => (
                            <li key={i} className="flex gap-1.5"><span className="text-muted-foreground">·</span>{d}</li>
                          ))}
                        </ul>
                      )}
                      {a.example_prompt && (
                        <pre className="whitespace-pre-wrap rounded bg-muted p-2 font-mono text-[10px] leading-relaxed">{a.example_prompt}</pre>
                      )}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    case "make_workflow":
      return (
        <div className="space-y-4 text-sm">
          {data.trigger && (
            <div className="rounded-xl border-2 border-blue-500/30 bg-blue-500/5 p-3">
              <div className="flex items-start gap-2">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-blue-500/40 bg-blue-500/10 text-blue-500 text-base">⚡</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{data.trigger.module_name}</div>
                    <span className="shrink-0 rounded-full border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-blue-500">Trigger</span>
                  </div>
                  {data.trigger.module_type && <div className="mt-0.5 inline-block rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{data.trigger.module_type}</div>}
                  {data.trigger.configuration && <p className="mt-2 text-xs text-foreground/80">{data.trigger.configuration}</p>}
                </div>
              </div>
              {data.trigger.input_data?.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-muted-foreground">Expected fields ({data.trigger.input_data.length})</summary>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {data.trigger.input_data.map((f: any, i: number) => (
                      <span key={i} className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]">
                        {f.field}<span className="text-muted-foreground">:{f.type}</span>{f.required && <span className="ml-1 text-rose-500">*</span>}
                      </span>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {data.processing_modules?.length > 0 && (
            <div>
              <SectionHeader Icon={Workflow} tone="amber" label="Processing modules" count={data.processing_modules.length} />
              <ol className="space-y-2">
                {data.processing_modules.map((m: any) => (
                  <li key={m.number} className="rounded-lg border border-border bg-card p-3 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium">#{m.number} · {m.name}</div>
                        {m.app && <div className="mt-0.5 inline-block rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{m.app}</div>}
                      </div>
                    </div>
                    {m.purpose && <p className="mt-2 text-foreground/80 line-clamp-2">{m.purpose}</p>}
                    {(m.input_mapping?.length > 0 || m.output_mapping?.length > 0) && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-muted-foreground">Mappings</summary>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          {m.input_mapping?.length > 0 && (
                            <div>
                              <div className="text-[10px] uppercase text-muted-foreground">Input</div>
                              <ul className="mt-0.5 space-y-0.5">
                                {m.input_mapping.map((io: any, i: number) => (
                                  <li key={i}><span className="font-mono">{io.field}</span> ← <span className="text-muted-foreground font-mono">{io.source}</span></li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {m.output_mapping?.length > 0 && (
                            <div>
                              <div className="text-[10px] uppercase text-muted-foreground">Output</div>
                              <ul className="mt-0.5 space-y-0.5">
                                {m.output_mapping.map((io: any, i: number) => (
                                  <li key={i}><span className="font-mono">{io.field}</span> → <span className="text-muted-foreground font-mono">{io.destination}</span></li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </details>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {data.filters?.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="text-[11px] uppercase tracking-wider text-amber-500">▽ Filters ({data.filters.length})</div>
                <div className="mt-2 space-y-2">
                  {data.filters.map((f: any, i: number) => (
                    <div key={i} className="rounded border border-border bg-card p-2 text-xs">
                      <div className="font-medium">{f.name}</div>
                      <ul className="mt-1 space-y-0.5">
                        {f.conditions?.map((c: any, ci: number) => (
                          <li key={ci}>
                            {ci > 0 && <span className="mr-1 text-muted-foreground">{c.logic}</span>}
                            <span className="font-mono">{c.field}</span> <span className="text-muted-foreground">{c.operator}</span> <span className="font-mono">{c.value}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.routers?.length > 0 && (
              <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
                <div className="text-[11px] uppercase tracking-wider text-violet-500">⇆ Routers ({data.routers.length})</div>
                <div className="mt-2 space-y-2">
                  {data.routers.map((r: any, i: number) => (
                    <div key={i} className="rounded border border-border bg-card p-2 text-xs">
                      <div className="font-medium">{r.path}</div>
                      {r.condition && <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{r.condition}</div>}
                      {r.description && <div className="mt-1 line-clamp-2">{r.description}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {data.error_handling && (
            <details className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
              <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-rose-500">! Error handling</summary>
              <div className="mt-2 space-y-2 text-xs">
                {data.error_handling.retry_logic && (
                  <div><span className="text-muted-foreground">Retry:</span> {data.error_handling.retry_logic}</div>
                )}
                <ColorCardGrid title="Validation checks" tone="rose" Icon={ShieldAlert} items={data.error_handling.validation_checks} compact />
                <ColorCardGrid title="Exception paths" tone="rose" Icon={AlertTriangle} items={data.error_handling.exception_paths} compact />
                {data.error_handling.failed_record_storage && (
                  <div><span className="text-muted-foreground">Failed records:</span> {data.error_handling.failed_record_storage}</div>
                )}
              </div>
            </details>
          )}

          {data.logging && (
            <details className="rounded-lg border border-border p-3 text-xs">
              <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-muted-foreground">Logging strategy</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {(["execution_log", "error_log", "audit_trail"] as const).map((k) =>
                  data.logging[k] ? (
                    <div key={k} className="rounded border border-border bg-muted/30 p-2">
                      <div className="text-[10px] uppercase text-muted-foreground">{k.replace("_", " ")}</div>
                      <div className="mt-0.5">{data.logging[k]}</div>
                    </div>
                  ) : null,
                )}
              </div>
            </details>
          )}

          {data.human_approval?.length > 0 && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="text-[11px] uppercase tracking-wider text-emerald-500">✓ Human approval</div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {data.human_approval.map((h: any, i: number) => (
                  <div key={i} className="rounded border border-border bg-card p-2 text-xs">
                    <div className="font-medium">{h.step}</div>
                    <div className="mt-1 grid gap-0.5 text-[11px]">
                      <div><span className="text-muted-foreground">Approver:</span> {h.approver}</div>
                      <div><span className="text-muted-foreground">Escalation:</span> {h.escalation}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    case "api_recommendations":
      return (
        <div className="space-y-3 text-sm">
          <SectionHeader Icon={DollarSign} tone="cyan" label="API recommendations" count={data.apis?.length ?? 0} />
          <div className="grid gap-3 md:grid-cols-2">
            {data.apis?.map((a: any) => {
              const riskTone = String(a.risks ?? "").toLowerCase().includes("high")
                ? "rose"
                : String(a.risks ?? "").toLowerCase().includes("med")
                ? "amber"
                : "emerald";
              const riskCls = TONE_MAP[riskTone];
              return (
                <div key={a.name} className="flex flex-col rounded-xl border border-cyan-500/30 bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-serif text-base">{a.name}</div>
                      {a.purpose && <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{a.purpose}</div>}
                    </div>
                    {a.cost_estimate && (
                      <span className="shrink-0 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-500">
                        {a.cost_estimate}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {a.auth && (
                      <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-500">
                        🔐 {a.auth}
                      </span>
                    )}
                    {a.scaling && (
                      <span className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-500">
                        ↗ {a.scaling}
                      </span>
                    )}
                    {a.risks && (
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] ${riskCls}`}>
                        ⚠ {a.risks}
                      </span>
                    )}
                  </div>

                  {(a.why_selected || (Array.isArray(a.alternatives) && a.alternatives.length > 0)) && (
                    <details className="mt-3 rounded-lg border border-border bg-muted/20">
                      <summary className="cursor-pointer px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">Why & alternatives</summary>
                      <div className="space-y-2 p-3 pt-0 text-xs">
                        {a.why_selected && (
                          <div>
                            <div className="text-[10px] uppercase text-muted-foreground">Why selected</div>
                            <div className="mt-0.5">{a.why_selected}</div>
                          </div>
                        )}
                        {Array.isArray(a.alternatives) && a.alternatives.length > 0 && (
                          <div>
                            <div className="text-[10px] uppercase text-muted-foreground">Alternatives</div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {a.alternatives.map((alt: string, i: number) => (
                                <span key={i} className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px]">{alt}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    case "api_recommendations":
      return (
        <div className="space-y-3 text-sm">
          {data.apis?.map((a: any) => (
            <div key={a.name} className="rounded-lg border border-border p-4">
              <div className="flex items-baseline justify-between gap-3">
                <div className="font-serif text-base">{a.name}</div>
                <div className="text-xs text-muted-foreground">{a.cost_estimate}</div>
              </div>
              {a.purpose && <div className="mt-1 text-xs text-muted-foreground">{a.purpose}</div>}
              {a.why_selected && (
                <div className="mt-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Why selected</div>
                  <div className="mt-1 text-xs">{a.why_selected}</div>
                </div>
              )}
              <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
                <div>
                  <div className="uppercase tracking-wide text-muted-foreground">Authentication</div>
                  <div className="mt-1">{a.auth}</div>
                </div>
                <div>
                  <div className="uppercase tracking-wide text-muted-foreground">Alternatives</div>
                  <div className="mt-1">
                    {Array.isArray(a.alternatives) && a.alternatives.length
                      ? a.alternatives.join(", ")
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="uppercase tracking-wide text-muted-foreground">Risks</div>
                  <div className="mt-1">{a.risks}</div>
                </div>
                <div>
                  <div className="uppercase tracking-wide text-muted-foreground">Scaling</div>
                  <div className="mt-1">{a.scaling}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    case "cost_estimate": {
      const fmt = (n: number) => `$${Math.round(n || 0).toLocaleString()}`;
      const totals = data.totals ?? {};
      return (
        <div className="space-y-5 text-sm">
          {Array.isArray(data.assumptions) && data.assumptions.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Assumptions</div>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
                {data.assumptions.map((a: string, i: number) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}

          {Array.isArray(data.volume_drivers) && data.volume_drivers.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Volume drivers</div>
              <table className="mt-1 w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr><th className="py-1">Driver</th><th>Low</th><th>Medium</th><th>High</th><th>Unit</th></tr>
                </thead>
                <tbody>
                  {data.volume_drivers.map((d: any, i: number) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-1.5">{d.driver}</td>
                      <td>{d.low}</td><td>{d.medium}</td><td>{d.high}</td>
                      <td className="text-muted-foreground">{d.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {Array.isArray(data.line_items) && data.line_items.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Line items by volume tier</div>
              <table className="mt-1 w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1">Category</th>
                    <th>Component</th>
                    <th className="text-right">Low / mo</th>
                    <th className="text-right">Medium / mo</th>
                    <th className="text-right">High / mo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.line_items.map((li: any, i: number) => (
                    <tr key={i} className="border-t border-border align-top">
                      <td className="py-1.5">
                        <div>{li.category}</div>
                        {li.unit && <div className="text-[10px] text-muted-foreground">{li.unit}</div>}
                      </td>
                      <td>
                        <div>{li.component}</div>
                        {li.note && <div className="text-[10px] text-muted-foreground">{li.note}</div>}
                      </td>
                      <td className="text-right">
                        <div>{fmt(li.low?.monthly_usd)}</div>
                        {li.low?.volume && <div className="text-[10px] text-muted-foreground">{li.low.volume}</div>}
                      </td>
                      <td className="text-right">
                        <div>{fmt(li.medium?.monthly_usd)}</div>
                        {li.medium?.volume && <div className="text-[10px] text-muted-foreground">{li.medium.volume}</div>}
                      </td>
                      <td className="text-right">
                        <div>{fmt(li.high?.monthly_usd)}</div>
                        {li.high?.volume && <div className="text-[10px] text-muted-foreground">{li.high.volume}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            {(["low", "medium", "high"] as const).map((tier) => (
              <div key={tier} className="rounded-lg border border-border p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{tier} volume</div>
                <div className="mt-1 flex justify-between font-serif">
                  <span>Monthly</span><span>{fmt(totals[tier]?.monthly_usd)}</span>
                </div>
                <div className="flex justify-between font-serif text-base">
                  <span>Annual</span><span>{fmt(totals[tier]?.annual_usd)}</span>
                </div>
              </div>
            ))}
          </div>

          {data.growth_scenario && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Growth scenario</div>
              <p className="mt-1 text-xs">{data.growth_scenario}</p>
            </div>
          )}

          {data.notes && <p className="text-xs text-muted-foreground">{data.notes}</p>}
        </div>
      );
    }
    case "readiness_score": {
      const score = Math.max(0, Math.min(100, Math.round(data.overall_score ?? 0)));
      const tone = score >= 85 ? "text-emerald-500" : score >= 70 ? "text-amber-500" : "text-rose-500";
      const barTone = score >= 85 ? "bg-emerald-500" : score >= 70 ? "bg-amber-500" : "bg-rose-500";
      return (
        <div className="space-y-5 text-sm">
          <div className="flex items-center gap-4 rounded-lg border border-border p-4">
            <div className={`font-serif text-4xl ${tone}`}>{score}%</div>
            <div className="flex-1">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Implementation Readiness</div>
              <div className="font-medium">{data.verdict ?? "—"}</div>
            </div>
          </div>

          {Array.isArray(data.factors) && data.factors.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Factors</div>
              {data.factors.map((f: any, i: number) => {
                const s = Math.max(0, Math.min(100, Math.round(f.score ?? 0)));
                const fb = s >= 85 ? "bg-emerald-500" : s >= 70 ? "bg-amber-500" : "bg-rose-500";
                return (
                  <div key={i} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{f.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {s}% {typeof f.weight === "number" && <span>· weight {Math.round(f.weight * 100)}%</span>}
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className={`h-full ${fb}`} style={{ width: `${s}%` }} />
                    </div>
                    {f.rationale && <p className="mt-2 text-xs text-muted-foreground">{f.rationale}</p>}
                    {Array.isArray(f.gaps) && f.gaps.length > 0 && (
                      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
                        {f.gaps.map((g: string, j: number) => <li key={j}>{g}</li>)}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <BulletList label="Top gaps" items={data.top_gaps} />
          <BulletList label="Blockers" items={data.blockers} />
          <BulletList label="Recommended next steps" items={data.recommended_next_steps} />
        </div>
      );
    }
    case "consultant_recommendations": {
      const toneFor = (v: string) => {
        const k = (v || "").toLowerCase();
        if (k.includes("high")) return "text-rose-500 border-rose-500/40 bg-rose-500/10";
        if (k.includes("med")) return "text-amber-500 border-amber-500/40 bg-amber-500/10";
        if (k.includes("low") || k === "s") return "text-emerald-500 border-emerald-500/40 bg-emerald-500/10";
        return "text-muted-foreground border-border bg-muted/30";
      };
      const Pill = ({ label, value }: { label: string; value?: string }) => value ? (
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${toneFor(value)}`}>
          <span className="opacity-70">{label}</span>
          <span className="font-medium">{value}</span>
        </span>
      ) : null;
      return (
        <div className="space-y-5 text-sm">
          {data.executive_summary && (
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Executive summary</div>
              <p className="leading-relaxed">{data.executive_summary}</p>
            </div>
          )}

          {Array.isArray(data.key_risks) && data.key_risks.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Key risks</div>
              {data.key_risks.map((r: any, i: number) => (
                <div key={i} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-medium">{r.risk}</div>
                    <div className="flex shrink-0 gap-1">
                      <Pill label="Impact" value={r.impact} />
                      <Pill label="Likelihood" value={r.likelihood} />
                    </div>
                  </div>
                  {r.mitigation && <p className="mt-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">Mitigation:</span> {r.mitigation}</p>}
                </div>
              ))}
            </div>
          )}

          {Array.isArray(data.recommended_improvements) && data.recommended_improvements.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Recommended improvements</div>
              {data.recommended_improvements.map((r: any, i: number) => (
                <div key={i} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">{r.area}</div>
                      <div className="font-medium">{r.recommendation}</div>
                    </div>
                    <Pill label="Effort" value={r.effort} />
                  </div>
                  {r.rationale && <p className="mt-2 text-xs text-muted-foreground">{r.rationale}</p>}
                </div>
              ))}
            </div>
          )}

          {Array.isArray(data.quick_wins) && data.quick_wins.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Quick wins</div>
              <div className="grid gap-2 md:grid-cols-2">
                {data.quick_wins.map((w: any, i: number) => (
                  <div key={i} className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium">{w.win}</div>
                      <Pill label="Effort" value={w.effort} />
                    </div>
                    {w.value && <p className="mt-1 text-xs text-muted-foreground">{w.value}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {Array.isArray(data.future_enhancements) && data.future_enhancements.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Future enhancements</div>
              {data.future_enhancements.map((e: any, i: number) => (
                <div key={i} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-medium">{e.enhancement}</div>
                    {e.when && <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{e.when}</span>}
                  </div>
                  {e.value && <p className="mt-1 text-xs text-muted-foreground">{e.value}</p>}
                </div>
              ))}
            </div>
          )}

          {Array.isArray(data.technical_debt_risks) && data.technical_debt_risks.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Technical debt risks</div>
              {data.technical_debt_risks.map((d: any, i: number) => (
                <div key={i} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <div className="font-medium">{d.debt}</div>
                  {d.consequence && <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium text-foreground">Consequence:</span> {d.consequence}</p>}
                  {d.remediation && <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium text-foreground">Remediation:</span> {d.remediation}</p>}
                </div>
              ))}
            </div>
          )}

          {data.closing_note && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs italic text-muted-foreground">{data.closing_note}</div>
          )}
        </div>
      );
    }
    case "make_blueprint": {
      const typeStyle = (t: string) => {
        switch ((t || "").toLowerCase()) {
          case "trigger": return "border-blue-500/40 bg-blue-500/10 text-blue-500";
          case "router": return "border-violet-500/40 bg-violet-500/10 text-violet-500";
          case "filter": return "border-amber-500/40 bg-amber-500/10 text-amber-500";
          case "data_store": return "border-cyan-500/40 bg-cyan-500/10 text-cyan-500";
          case "approval": return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
          case "error_handler": return "border-rose-500/40 bg-rose-500/10 text-rose-500";
          default: return "border-border bg-muted/40 text-muted-foreground";
        }
      };
      const moduleTypeIcon = (t: string) => {
        switch ((t || "").toLowerCase()) {
          case "trigger": return "⚡";
          case "router": return "⇆";
          case "filter": return "▽";
          case "data_store": return "▤";
          case "approval": return "✓";
          case "error_handler": return "!";
          default: return "■";
        }
      };
      const findRouter = (mod: any) =>
        (Array.isArray(data.routers) ? data.routers : []).find(
          (r: any) => r.after_module === mod.number || r.name === mod.name,
        );
      const findFilters = (modNumber: number) =>
        (Array.isArray(data.filters) ? data.filters : []).filter((f: any) => f.after_module === modNumber);

      const ModuleCard = ({ m }: { m: any }) => (
        <div className={`relative w-full max-w-md rounded-xl border-2 bg-card px-4 py-3 shadow-sm ${typeStyle(m.type)}`}>
          <div className="flex items-start gap-3">
            <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border ${typeStyle(m.type)} text-base`}>
              {moduleTypeIcon(m.type)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="truncate font-medium text-foreground">#{m.number} · {m.name}</div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${typeStyle(m.type)}`}>{m.type}</span>
              </div>
              {m.app && <div className="mt-0.5 inline-block rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{m.app}</div>}
              {m.purpose && <p className="mt-2 text-xs text-foreground/80">{m.purpose}</p>}
            </div>
          </div>
        </div>
      );

      const FlowArrow = () => (
        <div className="flex flex-col items-center" aria-hidden="true">
          <div className="h-5 w-px bg-border" />
          <ChevronDown className="-mt-1 h-4 w-4 text-muted-foreground" />
        </div>
      );

      const modules: any[] = Array.isArray(data.module_sequence) ? data.module_sequence : [];

      return (
        <div className="space-y-6 text-sm">
          {(data.scenario_name || data.description) && (
            <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent p-4">
              {data.scenario_name && <div className="text-[11px] uppercase tracking-wider text-amber-500">Scenario</div>}
              {data.scenario_name && <div className="mt-0.5 font-serif text-lg">{data.scenario_name}</div>}
              {data.description && <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{data.description}</p>}
            </div>
          )}

          {/* Visual flow */}
          {modules.length > 0 && (
            <div>
              <div className="mb-3 text-[11px] uppercase tracking-wider text-muted-foreground">Visual flow</div>
              <div className="rounded-xl border border-border bg-muted/10 p-6">
                <div className="flex flex-col items-center gap-0">
                  {modules.map((m, i) => {
                    const router = (m.type || "").toLowerCase() === "router" ? findRouter(m) : null;
                    const attachedFilters = findFilters(m.number);
                    const isLast = i === modules.length - 1;
                    return (
                      <div key={i} className="flex w-full flex-col items-center">
                        <ModuleCard m={m} />
                        {attachedFilters.length > 0 && (
                          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                            {attachedFilters.map((f: any, fi: number) => (
                              <span key={fi} className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-500">
                                ▽ {f.name}
                              </span>
                            ))}
                          </div>
                        )}
                        {router && Array.isArray(router.branches) && router.branches.length > 0 ? (
                          <div className="w-full">
                            <div className="my-2 flex justify-center text-muted-foreground" aria-hidden="true">↙ ↓ ↘</div>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              {router.branches.map((b: any, bi: number) => (
                                <div key={bi} className="rounded-lg border-2 border-violet-500/30 bg-violet-500/5 p-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium text-violet-500">{b.label}</span>
                                  </div>
                                  {b.condition && (
                                    <code className="mt-1 block truncate rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                      {b.condition}
                                    </code>
                                  )}
                                  {Array.isArray(b.modules) && b.modules.length > 0 && (
                                    <ul className="mt-2 space-y-1">
                                      {b.modules.map((bm: string, bmi: number) => (
                                        <li key={bmi} className="rounded border border-border bg-card px-2 py-1 text-xs">
                                          {bm}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                  {b.outcome && <div className="mt-2 text-[11px] italic text-muted-foreground">→ {b.outcome}</div>}
                                </div>
                              ))}
                            </div>
                            {!isLast && <div className="mt-3"><FlowArrow /></div>}
                          </div>
                        ) : !isLast ? (
                          <FlowArrow />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Side panels: data stores + error handlers + approvals */}
          <div className="grid gap-4 md:grid-cols-2">
            {Array.isArray(data.data_stores) && data.data_stores.length > 0 && (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
                <div className="text-[11px] uppercase tracking-wider text-cyan-500">▤ Data stores</div>
                <div className="mt-2 space-y-2">
                  {data.data_stores.map((s: any, i: number) => (
                    <div key={i} className="rounded border border-border bg-card p-2 text-xs">
                      <div className="font-medium">{s.name}</div>
                      {s.purpose && <div className="mt-0.5 text-muted-foreground">{s.purpose}</div>}
                      {Array.isArray(s.fields) && s.fields.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {s.fields.map((fl: any, fi: number) => (
                            <li key={fi}><span className="font-mono">{fl.name}</span> <span className="text-muted-foreground">: {fl.type}</span></li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(data.error_handlers) && data.error_handlers.length > 0 && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
                <div className="text-[11px] uppercase tracking-wider text-rose-500">! Error handlers</div>
                <div className="mt-2 space-y-2">
                  {data.error_handlers.map((e: any, i: number) => (
                    <div key={i} className="rounded border border-border bg-card p-2 text-xs">
                      <div className="font-medium">{e.module}</div>
                      <div className="mt-0.5"><span className="text-muted-foreground">Strategy:</span> {e.strategy}</div>
                      {e.fallback && <div className="mt-0.5"><span className="text-muted-foreground">Fallback:</span> {e.fallback}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(data.human_approval_steps) && data.human_approval_steps.length > 0 && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 md:col-span-2">
                <div className="text-[11px] uppercase tracking-wider text-emerald-500">✓ Human approval</div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {data.human_approval_steps.map((h: any, i: number) => (
                    <div key={i} className="rounded border border-border bg-card p-2 text-xs">
                      <div className="font-medium">{h.step}</div>
                      <div className="mt-1 grid gap-0.5 text-[11px]">
                        <div><span className="text-muted-foreground">Approver:</span> {h.approver}</div>
                        <div><span className="text-muted-foreground">Channel:</span> {h.channel}</div>
                        <div><span className="text-muted-foreground">SLA:</span> {h.sla}</div>
                        <div><span className="text-muted-foreground">Escalation:</span> {h.escalation}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Raw ASCII tree as collapsible */}
          {data.tree_diagram && (
            <details className="rounded-xl border border-border bg-muted/20 p-4 text-xs">
              <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-muted-foreground">Raw ASCII flow</summary>
              <pre className="mt-3 overflow-x-auto font-mono text-xs leading-relaxed">{data.tree_diagram}</pre>
            </details>
          )}
        </div>
      );
    }

    case "roadmap":
      return (
        <div className="space-y-5 text-sm">
          {Array.isArray(data.phases) && data.phases.length > 0 && (
            <div className="relative">
              <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border md:left-[19px]" aria-hidden="true" />
              <ol className="space-y-3">
                {data.phases.map((p: any, i: number) => (
                  <li key={i} className="relative flex gap-3 md:gap-4">
                    <div className="z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-rose-500/40 bg-card font-serif text-sm text-rose-500 md:h-10 md:w-10">
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1 rounded-lg border border-border bg-card p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="font-medium">{p.name}</div>
                        {p.duration && (
                          <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                            <Clock className="-mt-0.5 mr-1 inline h-2.5 w-2.5" />{p.duration}
                          </span>
                        )}
                      </div>
                      {Array.isArray(p.deliverables) && p.deliverables.length > 0 && (
                        <div className="mt-2">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Deliverables</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {p.deliverables.map((d: string, j: number) => (
                              <span key={j} className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px]">{d}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {Array.isArray(p.milestones) && p.milestones.length > 0 && (
                        <div className="mt-2">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Milestones</div>
                          <ul className="mt-1 space-y-0.5 text-xs">
                            {p.milestones.map((m: string, j: number) => (
                              <li key={j} className="flex gap-1.5"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />{m}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <ColorCardGrid title="Dependencies" tone="blue" Icon={Network} items={data.dependencies} compact />
            <ColorCardGrid title="Risks" tone="amber" Icon={ShieldAlert} items={data.risks} compact />
          </div>
        </div>
      );
    case "proposal":
      return (
        <div className="space-y-4 text-sm">
          {data.overview && (
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Overview</div>
              <p className="mt-1 leading-relaxed">{data.overview}</p>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <ProposalCard tone="violet" Icon={Target} title="Scope" items={data.scope} />
            <ProposalCard tone="emerald" Icon={FileText} title="Deliverables" items={data.deliverables} />
          </div>
          {data.timeline && (
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4">
              <div className="flex items-center gap-2">
                <div className="grid h-7 w-7 place-items-center rounded-md border border-cyan-500/40 bg-cyan-500/10 text-cyan-500">
                  <Clock className="h-3.5 w-3.5" />
                </div>
                <div className="text-[11px] uppercase tracking-wider text-cyan-500">Timeline</div>
              </div>
              <p className="mt-2 text-sm">{data.timeline}</p>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <ProposalCard tone="amber" Icon={AlertTriangle} title="Assumptions" items={data.assumptions} muted />
            <ProposalCard tone="rose" Icon={TrendingUp} title="Success metrics" items={data.success_metrics} />
          </div>
        </div>
      );
    default:
      return <pre className="text-xs">{JSON.stringify(data, null, 2)}</pre>;
  }
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
function BulletList({ label, items }: { label: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <ul className="mt-1 space-y-0.5 text-sm">
        {items.map((it, i) => <li key={i}>· {it}</li>)}
      </ul>
    </div>
  );
}

function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || !chart) return;
    mermaid.initialize({ startOnLoad: false, theme: "neutral", fontFamily: "Inter" });
    const id = `m${Math.random().toString(36).slice(2)}`;
    mermaid.render(id, chart).then(({ svg }) => {
      if (ref.current) ref.current.innerHTML = svg;
    }).catch((e) => {
      if (ref.current) ref.current.textContent = `Diagram error: ${e.message}`;
    });
  }, [chart]);
  return <div ref={ref} className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-4" />;
}

function StateCard({ tone, Icon, label, body }: { tone: string; Icon: typeof AlertTriangle; label: string; body?: string }) {
  const cls = TONE_MAP[tone] ?? TONE_MAP.muted;
  return (
    <div className={`rounded-lg border ${cls.split(" ")[1]} bg-card p-4`}>
      <div className="flex items-center gap-2">
        <div className={`grid h-7 w-7 place-items-center rounded-md border ${cls}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className={`text-[11px] uppercase tracking-wider ${cls.split(" ")[0]}`}>{label}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed line-clamp-6">{body || "—"}</p>
    </div>
  );
}

function ColorCardGrid({
  title, tone, Icon, items, compact,
}: { title: string; tone: string; Icon: typeof AlertTriangle; items?: string[]; compact?: boolean }) {
  if (!Array.isArray(items) || !items.length) return null;
  const cls = TONE_MAP[tone] ?? TONE_MAP.muted;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <div className={`grid h-6 w-6 place-items-center rounded-md border ${cls}`}>
          <Icon className="h-3 w-3" />
        </div>
        <span className={`text-[11px] uppercase tracking-wider ${cls.split(" ")[0]}`}>{title}</span>
        <span className="text-[10px] text-muted-foreground">({items.length})</span>
      </div>
      <div className={compact ? "grid gap-2" : "grid gap-2 md:grid-cols-2"}>
        {items.map((it, i) => (
          <div key={i} className={`rounded-lg border ${cls.split(" ")[1]} ${cls.split(" ")[2]} px-3 py-2 text-xs leading-relaxed`}>
            {it}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProposalCard({
  tone, Icon, title, items, muted,
}: { tone: string; Icon: typeof Target; title: string; items?: string[]; muted?: boolean }) {
  if (!Array.isArray(items) || !items.length) return null;
  const cls = TONE_MAP[tone] ?? TONE_MAP.muted;
  return (
    <div className={`rounded-lg border ${muted ? "border-border" : cls.split(" ")[1]} bg-card p-4`}>
      <div className="flex items-center gap-2">
        <div className={`grid h-7 w-7 place-items-center rounded-md border ${cls}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className={`text-[11px] uppercase tracking-wider ${muted ? "text-muted-foreground" : cls.split(" ")[0]}`}>{title}</div>
      </div>
      <ul className="mt-2 space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-xs leading-relaxed">
            <Check className={`mt-0.5 h-3 w-3 shrink-0 ${muted ? "text-muted-foreground" : cls.split(" ")[0]}`} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectionHeader({ Icon, tone, label, count }: { Icon: typeof Network; tone: string; label: string; count?: number }) {
  const cls = TONE_MAP[tone] ?? TONE_MAP.muted;
  return (
    <div className="mb-2 flex items-center gap-2">
      <div className={`grid h-6 w-6 place-items-center rounded-md border ${cls}`}>
        <Icon className="h-3 w-3" />
      </div>
      <span className={`text-[11px] uppercase tracking-wider ${cls.split(" ")[0]}`}>{label}</span>
      {typeof count === "number" && count > 0 && (
        <span className="text-[10px] text-muted-foreground">({count})</span>
      )}
    </div>
  );
}
