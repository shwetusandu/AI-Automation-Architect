import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Copy, Download, X, CheckCircle2, Code2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  blueprint: any;
  scenarioName?: string;
};

// Lightweight JSON syntax highlighter (no deps). Returns HTML string.
function highlightJson(jsonStr: string): string {
  const esc = jsonStr
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = "text-emerald-300"; // number
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? "text-sky-300" : "text-amber-200";
      } else if (/true|false/.test(match)) {
        cls = "text-violet-300";
      } else if (/null/.test(match)) {
        cls = "text-rose-300";
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

function toN8n(bp: any) {
  const modules: any[] = Array.isArray(bp?.module_sequence) ? bp.module_sequence : [];
  return {
    name: bp?.scenario_name || "Imported Workflow",
    nodes: modules.map((m, i) => ({
      id: String(m.number ?? i + 1),
      name: m.name || `Node ${i + 1}`,
      type: mapN8nType(m.type),
      typeVersion: 1,
      position: [240 + i * 220, 300],
      parameters: { app: m.app || "", purpose: m.purpose || "" },
    })),
    connections: modules.slice(0, -1).reduce((acc: any, m, i) => {
      const from = m.name || `Node ${i + 1}`;
      const to = modules[i + 1].name || `Node ${i + 2}`;
      acc[from] = { main: [[{ node: to, type: "main", index: 0 }]] };
      return acc;
    }, {}),
    active: false,
    settings: {},
    tags: ["generated", "lovable"],
  };
}

function mapN8nType(t: string) {
  switch ((t || "").toLowerCase()) {
    case "trigger": return "n8n-nodes-base.webhook";
    case "router": return "n8n-nodes-base.switch";
    case "filter": return "n8n-nodes-base.if";
    case "data_store": return "n8n-nodes-base.postgres";
    case "approval": return "n8n-nodes-base.wait";
    case "error_handler": return "n8n-nodes-base.errorTrigger";
    default: return "n8n-nodes-base.function";
  }
}

// API Payload Examples tab is reserved for future release.
// function toApiPayloads(bp: any) { ... }

export function BlueprintCodeModal({ open, onOpenChange, blueprint, scenarioName }: Props) {
  const [tab, setTab] = useState("make");

  const makeJson = useMemo(() => JSON.stringify(blueprint ?? {}, null, 2), [blueprint]);
  const n8nJson = useMemo(() => JSON.stringify(toN8n(blueprint ?? {}), null, 2), [blueprint]);

  const current = tab === "make" ? makeJson : n8nJson;
  const currentLabel = tab === "make" ? "Make.com Blueprint" : "n8n Workflow";
  const currentFilename =
    tab === "make"
      ? `${(scenarioName || "scenario").replace(/\s+/g, "_").toLowerCase()}.make.json`
      : `${(scenarioName || "scenario").replace(/\s+/g, "_").toLowerCase()}.n8n.json`;

  const isValid = useMemo(() => {
    try { JSON.parse(current); return true; } catch { return false; }
  }, [current]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(current);
      toast.success(`${currentLabel} copied`);
    } catch {
      toast.error("Copy failed");
    }
  };

  const download = () => {
    const blob = new Blob([current], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = currentFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${currentFilename}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden border-zinc-800 bg-zinc-950 p-0 text-zinc-100">
        <DialogHeader className="border-b border-zinc-800 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-zinc-100">
            <Code2 className="h-4 w-4 text-amber-400" />
            Scenario Blueprint · Code
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex h-[75vh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900/60 px-5 py-3">
            <TabsList className="bg-zinc-900">
              <TabsTrigger value="make" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-amber-300">Make.com Blueprint</TabsTrigger>
              <TabsTrigger value="n8n" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-amber-300">n8n Workflow JSON</TabsTrigger>
            </TabsList>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                  isValid
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border-rose-500/40 bg-rose-500/10 text-rose-300"
                }`}
                aria-live="polite"
              >
                <CheckCircle2 className="h-3 w-3" />
                {isValid ? (tab === "make" ? "Valid Make Blueprint" : "Valid n8n JSON") : "Invalid JSON"}
              </span>
            </div>
          </div>

          {(["make", "n8n"] as const).map((t) => (
            <TabsContent key={t} value={t} className="m-0 flex-1 overflow-hidden">
              <div className="h-full overflow-auto bg-zinc-950">
                <pre
                  className="m-0 min-h-full whitespace-pre p-5 font-mono text-[12.5px] leading-relaxed text-zinc-200"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{
                    __html: highlightJson(t === "make" ? makeJson : n8nJson),
                  }}
                />
              </div>
            </TabsContent>
          ))}

          <div className="flex items-center justify-between gap-2 border-t border-zinc-800 bg-zinc-900/60 px-5 py-3">
            <div className="text-[11px] text-zinc-500">
              {currentLabel} · {current.split("\n").length} lines · {(new Blob([current]).size / 1024).toFixed(1)} KB
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {tab === "make" ? (
                <>
                  <Button size="sm" variant="outline" onClick={copy} className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-zinc-50">
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
                  </Button>
                  <Button size="sm" variant="outline" onClick={download} className="border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300">
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Download JSON
                  </Button>
                  <DialogClose asChild>
                    <Button size="sm" className="bg-amber-500 text-zinc-950 hover:bg-amber-400">
                      <X className="mr-1.5 h-3.5 w-3.5" /> Close
                    </Button>
                  </DialogClose>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={download} className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-zinc-50">
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                </Button>
              )}
            </div>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
