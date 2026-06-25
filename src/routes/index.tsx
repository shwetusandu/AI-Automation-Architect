import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Layers, FileText, GitBranch } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Automation Architect — Design automation solutions like a senior consultant" },
      { name: "description", content: "Transform business requirements into implementation-ready automation architectures, workflows, cost estimates, and client proposals." },
      { property: "og:title", content: "AI Automation Architect" },
      { property: "og:description", content: "An AI consulting workspace for designing automation solutions end-to-end." },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebSite",
              name: "AI Automation Architect",
              url: "/",
              description: "An AI consulting workspace for designing automation solutions end-to-end.",
            },
            {
              "@type": "Organization",
              name: "AI Automation Architect",
              url: "/",
              description: "An AI consulting workspace that transforms business requirements into implementation-ready automation architectures, workflows, cost estimates, and client proposals.",
            },
          ],
        }),
      },
    ],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="font-serif text-lg font-semibold tracking-tight">Architect</span>
          </div>
          <nav className="flex items-center gap-3">
            <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">
              Sign in
            </Link>
            <Button asChild size="sm">
              <Link to="/auth">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-6 pb-24 pt-24 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            AI consulting workspace
          </div>
          <h1 className="text-balance font-serif text-5xl font-medium tracking-tight md:text-6xl">
            Design automation solutions <span className="italic text-muted-foreground">like a senior AI consultant.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
            Transform business requirements into implementation-ready automation architectures,
            workflows, cost estimates, and client proposals.
          </p>
          <div className="mt-10 flex items-center justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-6 text-base">
              <Link to="/auth">
                Start new solution
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="border-t border-border/60 bg-card/40">
          <div className="mx-auto grid max-w-6xl gap-px overflow-hidden border-x border-border/60 bg-border md:grid-cols-4">
            {[
              { icon: Sparkles, k: "Discovery", v: "Conversational consultant gathers structured requirements." },
              { icon: GitBranch, k: "Strategy", v: "Three approaches: budget, recommended, enterprise." },
              { icon: Layers, k: "Architecture", v: "Components, integrations, agents, and Mermaid diagrams." },
              { icon: FileText, k: "Proposal", v: "Client-ready scope, timeline, costs, and roadmap." },
            ].map((f) => (
              <div key={f.k} className="bg-card p-8">
                <f.icon className="h-5 w-5 text-accent" />
                <div className="mt-4 font-serif text-lg">{f.k}</div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.v}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 py-24">
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <h2 className="font-serif text-3xl tracking-tight">From a paragraph to a delivery package.</h2>
            <p className="mt-3 text-muted-foreground">
              Describe a business process. The platform conducts discovery, classifies the domain,
              proposes strategies, and produces deliverables on demand.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        Built for automation consultants and solutions architects.
      </footer>
    </div>
  );
}
