import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronRight,
  ChevronDown,
  Download,
  FileImage,
  FileText,
  FileDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Target,
  Database,
  Bot,
  Plug,
  GitBranch,
  Workflow,
  UserCheck,
  Send,
  ShieldAlert,
  Rocket,
  Brain,
  Briefcase,
} from "lucide-react";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import { toast } from "sonner";

export type MindNode = {
  id: string;
  label: string;
  detail?: string;
  Icon?: typeof Target;
  tone?: "blue" | "violet" | "emerald" | "amber" | "rose" | "cyan" | "slate";
  children?: MindNode[];
};

const TONE: Record<NonNullable<MindNode["tone"]>, string> = {
  blue: "text-blue-500 border-blue-500/30 bg-blue-500/10",
  violet: "text-violet-500 border-violet-500/30 bg-violet-500/10",
  emerald: "text-emerald-500 border-emerald-500/30 bg-emerald-500/10",
  amber: "text-amber-500 border-amber-500/30 bg-amber-500/10",
  rose: "text-rose-500 border-rose-500/30 bg-rose-500/10",
  cyan: "text-cyan-500 border-cyan-500/30 bg-cyan-500/10",
  slate: "text-slate-300 border-slate-500/30 bg-slate-500/10",
};

function collectIds(node: MindNode, acc: Set<string> = new Set()): Set<string> {
  acc.add(node.id);
  node.children?.forEach((c) => collectIds(c, acc));
  return acc;
}

function TreeNode({
  node,
  depth,
  expanded,
  toggle,
}: {
  node: MindNode;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
}) {
  const hasChildren = !!node.children?.length;
  const open = expanded.has(node.id);
  const Icon = node.Icon;
  const toneCls = TONE[node.tone ?? "slate"];

  return (
    <div className="relative">
      <div className={`flex items-start gap-2 ${depth > 0 ? "pl-5" : ""}`}>
        {hasChildren ? (
          <button
            onClick={() => toggle(node.id)}
            className="mt-1.5 grid h-5 w-5 shrink-0 place-items-center rounded border border-border bg-card hover:bg-muted"
            aria-label={open ? "Collapse" : "Expand"}
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <span className="mt-1.5 inline-block h-5 w-5 shrink-0" />
        )}

        <div
          className={`flex-1 rounded-lg border ${toneCls.split(" ")[1]} ${
            depth === 0 ? "bg-card shadow-sm" : "bg-card/60"
          } px-3 py-2`}
        >
          <div className="flex items-start gap-2">
            {Icon && (
              <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-md border ${toneCls}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className={`${depth === 0 ? "font-serif text-base" : "text-sm font-medium"} leading-tight`}>
                {node.label}
              </div>
              {node.detail && (
                <div className="mt-0.5 text-xs text-muted-foreground">{node.detail}</div>
              )}
            </div>
            {hasChildren && (
              <Badge variant="outline" className="text-[10px]">
                {node.children!.length}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {hasChildren && open && (
        <div className="relative ml-2.5 mt-1 border-l border-dashed border-border pl-2">
          <div className="space-y-1.5">
            {node.children!.map((child) => (
              <TreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                toggle={toggle}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function nodeToMarkdown(node: MindNode, depth = 0): string {
  const indent = "  ".repeat(depth);
  const bullet = depth === 0 ? "# " : `${indent}- `;
  let out = `${bullet}**${node.label}**`;
  if (node.detail) out += ` — ${node.detail}`;
  out += "\n";
  node.children?.forEach((c) => {
    out += nodeToMarkdown(c, depth + 1);
  });
  return out;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function MindMap({
  business,
  technical,
  projectName,
}: {
  business: MindNode;
  technical: MindNode;
  projectName: string;
}) {
  const [view, setView] = useState<"business" | "technical">("business");
  const active = view === "business" ? business : technical;
  const allIds = useMemo(() => collectIds(active), [active]);
  const [expanded, setExpanded] = useState<Set<string>>(() => collectIds(active));
  const captureRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpanded(new Set(allIds));
  }
  function collapseAll() {
    setExpanded(new Set([active.id]));
  }

  function switchView(v: "business" | "technical") {
    setView(v);
    const next = v === "business" ? business : technical;
    setExpanded(collectIds(next));
  }

  async function exportPng() {
    if (!captureRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(captureRef.current, {
        backgroundColor: getComputedStyle(document.body).backgroundColor || "#0a0a0a",
        pixelRatio: 2,
        cacheBust: true,
      });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      downloadBlob(blob, `${projectName}-mindmap-${view}.png`);
      toast.success("PNG exported");
    } catch (e) {
      toast.error("Failed to export PNG");
    } finally {
      setExporting(false);
    }
  }

  async function exportPdf() {
    if (!captureRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(captureRef.current, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        cacheBust: true,
      });
      const img = new Image();
      img.src = dataUrl;
      await new Promise((res) => (img.onload = res));
      const orientation = img.width > img.height ? "landscape" : "portrait";
      const pdf = new jsPDF({ orientation, unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pageW / img.width, pageH / img.height);
      const w = img.width * ratio;
      const h = img.height * ratio;
      pdf.addImage(dataUrl, "PNG", (pageW - w) / 2, (pageH - h) / 2, w, h);
      pdf.save(`${projectName}-mindmap-${view}.pdf`);
      toast.success("PDF exported");
    } catch {
      toast.error("Failed to export PDF");
    } finally {
      setExporting(false);
    }
  }

  function exportMarkdown() {
    const md = `# ${projectName} — ${view === "business" ? "Business" : "Technical"} Mind Map\n\n${nodeToMarkdown(active)}`;
    downloadBlob(new Blob([md], { type: "text/markdown" }), `${projectName}-mindmap-${view}.md`);
    toast.success("Markdown exported");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          <button
            onClick={() => switchView("business")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
              view === "business" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Briefcase className="h-3.5 w-3.5" /> Business
          </button>
          <button
            onClick={() => switchView("technical")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
              view === "technical" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Brain className="h-3.5 w-3.5" /> Technical
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={expandAll}>
            <ChevronsUpDown className="mr-1 h-3.5 w-3.5" /> Expand all
          </Button>
          <Button size="sm" variant="outline" onClick={collapseAll}>
            <ChevronsDownUp className="mr-1 h-3.5 w-3.5" /> Collapse all
          </Button>
          <div className="mx-1 h-5 w-px bg-border" />
          <Button size="sm" variant="outline" onClick={exportPng} disabled={exporting}>
            <FileImage className="mr-1 h-3.5 w-3.5" /> PNG
          </Button>
          <Button size="sm" variant="outline" onClick={exportPdf} disabled={exporting}>
            <FileDown className="mr-1 h-3.5 w-3.5" /> PDF
          </Button>
          <Button size="sm" variant="outline" onClick={exportMarkdown}>
            <FileText className="mr-1 h-3.5 w-3.5" /> Markdown
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-gradient-to-br from-card to-card/40 p-5">
        <div ref={captureRef} className="space-y-2 p-2">
          <TreeNode node={active} depth={0} expanded={expanded} toggle={toggle} />
        </div>
      </div>
    </div>
  );
}

// ============ Builders ============
type ProjectLike = {
  name?: string | null;
  domain?: string | null;
  requirements?: unknown;
};

function asStringArray(v: unknown, fallback: string[] = []): string[] {
  if (Array.isArray(v))
    return v
      .map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? JSON.stringify(x) : String(x ?? "")))
      .filter(Boolean)
      .slice(0, 12);
  return fallback;
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() ? v : fallback;
}

export function buildMindMaps(
  project: ProjectLike,
  selectedStrategy: Record<string, unknown> | null,
  byKind: Map<string, unknown>,
): { business: MindNode; technical: MindNode } {
  const reqs = (project.requirements as Record<string, string | null>) ?? {};
  const domain = project.domain ?? "Automation";
  const name = project.name ?? "Project";

  const ba = (byKind.get("business_analysis") as any) ?? {};
  const arch = (byKind.get("architecture") as any) ?? {};
  const agents = (byKind.get("ai_agents") as any) ?? {};
  const mw = (byKind.get("make_workflow") as any) ?? {};
  const bp = (byKind.get("make_blueprint") as any) ?? {};
  const apis = (byKind.get("api_recommendations") as any) ?? {};
  const recs = (byKind.get("consultant_recommendations") as any) ?? {};
  const roadmap = (byKind.get("roadmap") as any) ?? {};

  // Business Mind Map
  const business: MindNode = {
    id: "b-root",
    label: `${name} — Business Goal`,
    detail: asString(ba.future_state, asString(reqs.trigger, `${domain} automation`)),
    Icon: Target,
    tone: "blue",
    children: [
      {
        id: "b-users",
        label: "Users & Stakeholders",
        Icon: UserCheck,
        tone: "violet",
        children: [
          { id: "b-u-owner", label: "Business owner", detail: "Approves scope and exception rules" },
          { id: "b-u-ops", label: "Operations team", detail: asString(reqs.notifications, "Receives notifications & handles exceptions") },
          { id: "b-u-end", label: "End users / customers", detail: "Benefit from faster, consistent handling" },
        ],
      },
      {
        id: "b-process",
        label: "Business Process",
        Icon: Workflow,
        tone: "amber",
        children: [
          { id: "b-p-trigger", label: "Trigger", detail: asString(reqs.trigger, "Inbound business event") },
          { id: "b-p-inputs", label: "Inputs", detail: asString(reqs.input_source, "Source system data") },
          { id: "b-p-processing", label: "Processing", detail: asString(reqs.processing, "Validation, enrichment, decisioning") },
          { id: "b-p-decision", label: "Decision logic", detail: asString(reqs.decision_logic, "Rules + AI scoring") },
        ],
      },
      {
        id: "b-outcomes",
        label: "Outcomes",
        Icon: Rocket,
        tone: "emerald",
        children: (asStringArray(ba.automation_opportunities).length
          ? asStringArray(ba.automation_opportunities)
          : [
              asString(reqs.outputs, "Structured outputs"),
              "Faster response time",
              "Consistent audit trail",
            ]
        ).map((label, i) => ({ id: `b-o-${i}`, label })),
      },
      {
        id: "b-pain",
        label: "Pain Points (Current)",
        Icon: ShieldAlert,
        tone: "rose",
        children: asStringArray(ba.pain_points, [
          "Manual handoffs slow response",
          "Context spread across systems",
          "Exceptions hard to audit",
        ]).map((label, i) => ({ id: `b-pp-${i}`, label })),
      },
      {
        id: "b-risks",
        label: "Risks",
        Icon: ShieldAlert,
        tone: "rose",
        children: (recs.key_risks?.length ? recs.key_risks : asStringArray(ba.risks).map((r: string) => ({ risk: r })))
          .slice(0, 6)
          .map((r: any, i: number) => ({
            id: `b-r-${i}`,
            label: asString(r.risk ?? r, `Risk ${i + 1}`),
            detail: r.impact ? `${r.impact} impact${r.likelihood ? ` · ${r.likelihood} likelihood` : ""}` : undefined,
          })),
      },
      {
        id: "b-future",
        label: "Future Enhancements",
        Icon: Rocket,
        tone: "cyan",
        children: (recs.future_enhancements?.length
          ? recs.future_enhancements
          : [{ enhancement: "Self-service rule editor" }, { enhancement: "Cross-system reconciliation" }, { enhancement: "Tuned scoring model" }]
        ).slice(0, 5).map((f: any, i: number) => ({
          id: `b-f-${i}`,
          label: asString(f.enhancement ?? f, `Enhancement ${i + 1}`),
          detail: asString(f.when, f.value ?? ""),
        })),
      },
    ],
  };

  // Technical Mind Map
  const stack = asStringArray(selectedStrategy?.stack, ["Make.com", "Postgres", "OpenAI", "Slack"]);
  const triggerName = asString(mw.trigger?.module_name, asString(bp.module_sequence?.[0]?.name, "Webhook trigger"));
  const modules = (mw.processing_modules?.length ? mw.processing_modules : bp.module_sequence) ?? [];
  const filters = (mw.filters ?? bp.filters) ?? [];
  const routers = (mw.routers ?? []).concat(bp.routers ?? []);
  const errorPaths: string[] = mw.error_handling?.exception_paths
    ? asStringArray(mw.error_handling.exception_paths)
    : (bp.error_handlers ?? []).map((e: any) => asString(e.strategy ?? e.module, "Error handler"));
  const dataStores = bp.data_stores ?? [];
  const integrations = asStringArray(arch.integrations, stack);

  const technical: MindNode = {
    id: "t-root",
    label: `${name} — Technical Architecture`,
    detail: asString(arch.data_flow, `${domain} automation built on ${stack.slice(0, 3).join(" + ")}`),
    Icon: Brain,
    tone: "violet",
    children: [
      {
        id: "t-trigger",
        label: "Trigger / Inputs",
        Icon: Send,
        tone: "blue",
        children: [
          { id: "t-trig", label: triggerName, detail: asString(mw.trigger?.module_type, "Make.com webhook") },
          ...asStringArray(mw.trigger?.input_data?.map((f: any) => `${f.field} (${f.type})`)).map((label, i) => ({
            id: `t-in-${i}`,
            label,
          })),
        ],
      },
      {
        id: "t-modules",
        label: "Make.com Modules",
        Icon: Workflow,
        tone: "amber",
        children: modules.slice(0, 10).map((m: any, i: number) => ({
          id: `t-m-${i}`,
          label: asString(m.name, `Module ${i + 1}`),
          detail: asString(m.app, m.purpose ?? ""),
        })),
      },
      {
        id: "t-filters",
        label: "Filters",
        Icon: GitBranch,
        tone: "amber",
        children: filters.slice(0, 8).map((f: any, i: number) => ({
          id: `t-f-${i}`,
          label: asString(f.name, `Filter ${i + 1}`),
          detail: (f.conditions ?? [])
            .map((c: any) => `${c.field} ${c.operator} ${c.value}`)
            .slice(0, 2)
            .join(" · "),
        })),
      },
      {
        id: "t-routers",
        label: "Routers / Decision Logic",
        Icon: GitBranch,
        tone: "violet",
        children: routers.slice(0, 6).map((r: any, i: number) => ({
          id: `t-r-${i}`,
          label: asString(r.path ?? r.name, `Path ${i + 1}`),
          detail: asString(r.condition, r.description ?? ""),
          children: asStringArray(r.modules ?? r.branches?.map((b: any) => b.label)).map((label, j) => ({
            id: `t-r-${i}-${j}`,
            label,
          })),
        })),
      },
      {
        id: "t-agents",
        label: "AI Agents",
        Icon: Bot,
        tone: "emerald",
        children: (agents.agents ?? []).slice(0, 6).map((a: any, i: number) => ({
          id: `t-a-${i}`,
          label: asString(a.name, `Agent ${i + 1}`),
          detail: asString(a.purpose, ""),
          children: [
            ...asStringArray(a.inputs).slice(0, 4).map((x, j) => ({ id: `t-a-${i}-in-${j}`, label: `in: ${x}` })),
            ...asStringArray(a.outputs).slice(0, 4).map((x, j) => ({ id: `t-a-${i}-out-${j}`, label: `out: ${x}` })),
          ],
        })),
      },
      {
        id: "t-apis",
        label: "APIs & Integrations",
        Icon: Plug,
        tone: "cyan",
        children: (apis.apis?.length
          ? apis.apis
          : integrations.map((n) => ({ name: n, auth: "API key / OAuth" }))
        ).slice(0, 8).map((a: any, i: number) => ({
          id: `t-api-${i}`,
          label: asString(a.name, `Integration ${i + 1}`),
          detail: asString(a.auth, a.purpose ?? ""),
        })),
      },
      {
        id: "t-data",
        label: "Databases & Data Stores",
        Icon: Database,
        tone: "slate",
        children: (dataStores.length
          ? dataStores
          : [
              { name: asString(arch.data_storage?.primary, "Primary store (Postgres)"), purpose: "Records & audit trail" },
              { name: asString(arch.data_storage?.secondary, "Secondary cache"), purpose: "Lookup cache" },
            ]
        ).slice(0, 6).map((d: any, i: number) => ({
          id: `t-d-${i}`,
          label: asString(d.name, `Store ${i + 1}`),
          detail: asString(d.purpose, ""),
        })),
      },
      {
        id: "t-approvals",
        label: "Human Approvals",
        Icon: UserCheck,
        tone: "amber",
        children: (mw.human_approval ?? bp.human_approval_steps ?? [])
          .slice(0, 5)
          .map((h: any, i: number) => ({
            id: `t-h-${i}`,
            label: asString(h.step, `Approval ${i + 1}`),
            detail: `${asString(h.approver, "Owner")}${h.sla ? ` · SLA ${h.sla}` : ""}`,
          })),
      },
      {
        id: "t-notifications",
        label: "Notifications / Outputs",
        Icon: Send,
        tone: "emerald",
        children: [
          { id: "t-n-1", label: "Outputs", detail: asString(reqs.outputs, "Structured records + status updates") },
          { id: "t-n-2", label: "Channels", detail: asString(reqs.notifications, "Slack + Email") },
        ],
      },
      {
        id: "t-errors",
        label: "Error Handling",
        Icon: ShieldAlert,
        tone: "rose",
        children: (errorPaths.length
          ? errorPaths
          : ["Retry with exponential backoff", "Quarantine failed payloads", "Escalate to ops channel"]
        ).slice(0, 6).map((label, i) => ({ id: `t-e-${i}`, label })),
      },
      {
        id: "t-roadmap",
        label: "Roadmap / Future Enhancements",
        Icon: Rocket,
        tone: "cyan",
        children: (roadmap.phases ?? []).slice(0, 5).map((p: any, i: number) => ({
          id: `t-rd-${i}`,
          label: asString(p.name, `Phase ${i + 1}`),
          detail: asString(p.duration, ""),
        })),
      },
    ],
  };

  return { business, technical };
}
