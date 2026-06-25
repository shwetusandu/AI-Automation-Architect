## Goal

Replace the current 2-column grid of 11 deliverable cards on the project page with a focused, single-open accordion that groups deliverables into the sections you outlined, and upgrade the Make.com workflow renderer into a visual node-card flow.

Scope is presentation-only — no changes to `ai.functions.ts`, prompts, schemas, or data generation. All existing deliverable kinds keep working; we just regroup and restyle how they render.

## New layout (in `projects.$projectId.tsx`, `DeliveryView`)

Top of page stays: project header + a compact **Executive Dashboard** strip (selected strategy badge, domain, est. monthly, complexity, scalability, plus a one-line summary).

Below it, a single-open shadcn `Accordion` (`type="single"`, `collapsible`) with these sections, each with a distinct accent icon and color:

1. **Executive Summary** — renders `business_analysis` (problem / solution / value / risks) + cost/timeline pulled from selected strategy. Keep to "one page" feel: tighter spacing, max 2 columns, no nested cards.
2. **Architecture** — renders `architecture` deliverable (diagram, data flow, systems, integrations).
3. **Make.com Workflow** — renders `make_blueprint` as the primary view (visual node flow, see below). `make_workflow` becomes a secondary "Detailed module spec" toggle inside the same panel.
4. **AI Agents** — renders `ai_agents` as agent cards only (already close; tighten card styling, drop extraneous chrome).
5. **Cost** — renders `cost_estimate` + `api_recommendations` (cost-adjacent) stacked.
6. **Roadmap** — renders `roadmap` + `readiness_score` + `consultant_recommendations` (implementation readiness story).
7. **Proposal** — renders `proposal`.

Each accordion section header shows: section title, short description, and a status pill (Generated / Not generated). The "Generate" button moves inside the panel body, so opening a section reveals either the content or a single CTA.

Single-open behavior is the default for shadcn `Accordion type="single"` — no extra state needed.

## Visual Make.com flow (new sub-component in same file)

Replace the current vertical numbered list inside the `make_blueprint` case with a node-graph renderer:

- Each module → a rounded card with a colored left border matched to module type (trigger=blue, action=slate, router=violet, filter=amber, data_store=cyan, approval=emerald, error_handler=rose) plus an icon and the app name as a small chip.
- Between sequential modules, render a centered vertical arrow (`↓`) using a dedicated `<FlowArrow />` element (border-left line + chevron) so spacing is consistent.
- When a router module is encountered, render its branches as a row of cards beneath the router with diagonal connector lines (CSS only — no SVG lib) and a `↙ ↘` glyph row. Each branch card lists its label, condition pill, and the module names in that branch.
- Keep the existing ASCII `tree_diagram` as a collapsible "Raw flow" details block underneath the visual diagram for builders who want to copy it.
- Filters render as inline amber chips attached to the module they follow.
- Error handlers and data stores render in two compact side panels under the main flow.

Visual style: dark-mode-aware using existing semantic tokens (`bg-card`, `border-border`, `text-muted-foreground`) plus the type-color utility classes already defined in the current `make_blueprint` case.

## Files touched

- `src/routes/_authenticated/projects.$projectId.tsx` — rewrite `DeliveryView`, add `<SectionAccordion>`, `<FlowDiagram>`, `<FlowNode>`, `<FlowArrow>`, `<RouterBranches>` helpers, and route each deliverable kind into its section. Reuse all existing `case` renderers inside `DeliverableContent` unchanged.

No other files change. No backend, prompt, or schema work.

## Out of scope

- No edits to AI prompts or normalizers.
- No new deliverable kinds.
- No new routes or pages (the "5 pages" framing is realized as the 7 accordion sections on this page).
