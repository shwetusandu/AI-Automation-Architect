import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const MODEL = "google/gemini-3-flash-preview";

function gw() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return createLovableAiGatewayProvider(key)(MODEL);
}

const DOMAINS = ["Recruiting", "Sales", "Marketing", "Customer Support", "Finance", "Operations"] as const;
const PILLARS = ["trigger", "input_source", "processing", "decision_logic", "outputs", "notifications", "scale"] as const;

function extractJson(raw: string): unknown {
  let cleaned = raw
    .replace(/^```json\s*/im, "")
    .replace(/^```\s*/im, "")
    .replace(/```\s*$/im, "")
    .trim();

  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
    const objectStart = cleaned.indexOf("{");
    const arrayStart = cleaned.indexOf("[");
    const startsWithArray = arrayStart !== -1 && (objectStart === -1 || arrayStart < objectStart);
    const start = startsWithArray ? arrayStart : objectStart;
    const end = startsWithArray ? cleaned.lastIndexOf("]") : cleaned.lastIndexOf("}");

    if (start === -1 || end <= start) {
      throw new Error("The AI response did not include valid JSON.");
    }

    cleaned = cleaned.slice(start, end + 1);
  }

  return JSON.parse(cleaned);
}

async function generateJson<T>(schema: z.ZodType<T>, prompt: string): Promise<T> {
  const { text, finishReason } = await generateText({
    model: gw(),
    temperature: 0.2,
    maxOutputTokens: 8192,
    prompt: `${prompt}

Return ONLY a valid JSON object that matches the requested shape. Do not include markdown, prose, comments, trailing commas, or code fences. Use plain numbers only, without currency symbols or thousands separators.`,
  });

  if (finishReason === "length") {
    throw new Error("The AI response was cut off. Please try again with a shorter request.");
  }

  const parsed = schema.safeParse(extractJson(text));
  if (!parsed.success) {
    console.error("AI JSON validation failed", parsed.error.flatten());
    throw new Error("The AI response could not be converted into the project structure. Please try again.");
  }

  return parsed.data;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function fallbackProjectBrief(initialRequest: string) {
  const firstWords = initialRequest
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .join(" ");

  return {
    project_name: firstWords ? `${firstWords} Automation` : "Automation Discovery",
    domain: "Operations",
    confidence: 50,
    opening_message: "I understand the automation outcome you want. I’ll run a focused discovery pass so the solution package is implementation-ready.",
    first_question: {
      text: "What event should trigger this automation?",
      pillar: "trigger",
      options: ["New email or form submission", "New record in a database", "Scheduled daily or weekly run", "Manual approval or button click", "Other"],
    },
  };
}

type StrategyPackage = {
  tier: string;
  headline: string;
  monthly_cost_usd: number;
  complexity: string;
  scalability: string;
  stack: string[];
  pros: string[];
  cons: string[];
  summary: string;
};

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function pick(record: Record<string, unknown>, keys: string[]): unknown {
  return keys.map((key) => record[key]).find((value) => value !== undefined && value !== null && value !== "");
}

function textValue(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    const joined = value.map((item) => textValue(item, "")).filter(Boolean).join(", ");
    return joined || fallback;
  }
  return fallback;
}

function numberValue(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return fallback;
}

function listValue(value: unknown, fallback: string[]): string[] {
  const list = Array.isArray(value)
    ? value.map((item) => textValue(item, "")).filter(Boolean)
    : typeof value === "string"
      ? value.split(/\n|;|,/).map((item) => item.trim()).filter(Boolean)
      : [];
  return list.length ? list : fallback;
}

function fallbackStrategies(project: { domain?: string | null; requirements?: unknown }): StrategyPackage[] {
  const domain = project.domain ?? "Operations";
  const requirements = recordOf(project.requirements);
  const trigger = textValue(requirements.trigger, "the identified business trigger");
  const output = textValue(requirements.outputs, "validated records, notifications, and operational updates");

  return [
    {
      tier: "budget",
      headline: "Lean no-code automation path",
      monthly_cost_usd: 150,
      complexity: "Low",
      scalability: "Medium",
      stack: ["Make.com", "Lovable Cloud", "Gmail", "Airtable"],
      pros: ["Fastest MVP path", "Low monthly platform cost", "Simple handoff for operators"],
      cons: ["Limited custom branching", "More manual review for edge cases"],
      summary: `A practical ${domain} automation that starts from ${trigger} and produces ${output} with lightweight no-code orchestration.`,
    },
    {
      tier: "recommended",
      headline: "Production workflow with AI review",
      monthly_cost_usd: 450,
      complexity: "Medium",
      scalability: "High",
      stack: ["Lovable Cloud", "Postgres", "OpenAI", "Make.com", "Slack"],
      pros: ["Balanced speed and reliability", "Structured data capture", "Clear monitoring and exception handling"],
      cons: ["Requires careful prompt and workflow QA", "Moderate integration setup"],
      summary: `A durable implementation that combines a cloud app, database, AI processing, and workflow automation for the discovered ${domain} requirements.`,
    },
    {
      tier: "enterprise",
      headline: "Governed automation platform",
      monthly_cost_usd: 1200,
      complexity: "High",
      scalability: "Very High",
      stack: ["Lovable Cloud", "Postgres", "OpenAI", "AWS", "HubSpot", "Slack"],
      pros: ["Best auditability", "Scales across teams", "Supports advanced approvals and analytics"],
      cons: ["Highest implementation effort", "More governance decisions up front"],
      summary: `A robust ${domain} automation foundation with governed integrations, audit trails, and scale-ready operational controls.`,
    },
  ];
}

function normalizeStrategy(value: unknown, tier: string, fallback: StrategyPackage): StrategyPackage {
  const item = recordOf(value);
  const tierValue = textValue(pick(item, ["tier", "type", "level", "name"]), tier).toLowerCase();
  const normalizedTier = ["budget", "recommended", "enterprise"].includes(tierValue) ? tierValue : tier;

  return {
    tier: normalizedTier,
    headline: textValue(pick(item, ["headline", "title", "name", "approach"]), fallback.headline),
    monthly_cost_usd: numberValue(pick(item, ["monthly_cost_usd", "monthlyCostUsd", "monthly_cost", "estimated_monthly_cost_usd", "cost", "price"]), fallback.monthly_cost_usd),
    complexity: textValue(pick(item, ["complexity", "implementation_complexity", "difficulty"]), fallback.complexity),
    scalability: textValue(pick(item, ["scalability", "scale", "scaling"]), fallback.scalability),
    stack: listValue(pick(item, ["stack", "tools", "technology_stack", "technologies", "platforms"]), fallback.stack),
    pros: listValue(pick(item, ["pros", "benefits", "advantages", "strengths"]), fallback.pros),
    cons: listValue(pick(item, ["cons", "risks", "limitations", "tradeoffs", "trade_offs"]), fallback.cons),
    summary: textValue(pick(item, ["summary", "description", "rationale", "overview"]), fallback.summary),
  };
}

const RequirementsSchema = z.object({
  trigger: z.string().nullable().optional(),
  input_source: z.string().nullable().optional(),
  processing: z.string().nullable().optional(),
  decision_logic: z.string().nullable().optional(),
  outputs: z.string().nullable().optional(),
  notifications: z.string().nullable().optional(),
  scale: z.string().nullable().optional(),
});
type Requirements = z.infer<typeof RequirementsSchema>;

const StartProjectAiSchema = z
  .object({
    project_name: z.string().optional(),
    domain: z.string().optional(),
    confidence: z.coerce.number().optional(),
    opening_message: z.string().optional(),
    first_question: z
      .union([
        z.string(),
        z.object({
          text: z.string().optional(),
          question: z.string().optional(),
          pillar: z.string().optional(),
          options: z.array(z.string()).optional(),
        }),
      ])
      .optional(),
    question: z.string().optional(),
    pillar: z.string().optional(),
    options: z.array(z.string()).optional(),
  })
  .passthrough()
  .transform((raw) => {
    const question = typeof raw.first_question === "string" ? raw.first_question : raw.first_question?.text ?? raw.first_question?.question ?? raw.question;
    const pillar = typeof raw.first_question === "object" ? raw.first_question.pillar : raw.pillar;
    const options = typeof raw.first_question === "object" ? raw.first_question.options : raw.options;

    return {
      project_name: raw.project_name ?? "Automation Discovery",
      domain: raw.domain ?? "Operations",
      confidence: raw.confidence ?? 50,
      opening_message: raw.opening_message ?? "I understand the automation outcome you want. I’ll run a focused discovery pass so the solution package is implementation-ready.",
      first_question: {
        text: question ?? "What event should trigger this automation?",
        pillar: pillar ?? "trigger",
        options: options?.length ? options : ["New email or form submission", "New record in a database", "Scheduled daily or weekly run", "Manual approval or button click", "Other"],
      },
    };
  });

function computeCompletion(reqs: Requirements): number {
  const filled = PILLARS.filter((p) => {
    const v = reqs[p];
    return typeof v === "string" && v.trim().length > 4;
  }).length;
  return Math.round((filled / PILLARS.length) * 100);
}

// 1. Domain classification + first discovery question
export const startProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ initialRequest: z.string().min(8) }).parse(d))
  .handler(async ({ data, context }) => {
    const object = await generateJson(
      StartProjectAiSchema,
      `You are a senior AI automation consultant. A new client said:\n"""${data.initialRequest}"""\n\nReturn JSON with keys: project_name, domain, confidence, opening_message, first_question. Classify the business domain. The "domain" field MUST be exactly one of: ${DOMAINS.join(", ")}. Produce a short project name (3-5 words), write a brief professional opening (1-2 sentences acknowledging their request and stating you'll run discovery), and ask the SINGLE most important first discovery question with 3-5 structured answer options. The "first_question.pillar" field MUST be exactly one of: ${PILLARS.join(", ")}. Confidence is 0-100.`,
    ).catch((error) => {
      console.error("AI project classification failed", error);
      return fallbackProjectBrief(data.initialRequest);
    });

    const domain = (DOMAINS as readonly string[]).includes(object.domain)
      ? object.domain
      : "Operations";

    const { data: project, error } = await context.supabase
      .from("projects")
      .insert({
        user_id: context.userId,
        name: object.project_name,
        initial_request: data.initialRequest,
        domain,
        domain_confidence: clampPercent(object.confidence),
        requirements: {},
        completion: 0,
        status: "discovery",
      })
      .select()
      .single();
    if (error) throw error;

    await context.supabase.from("messages").insert([
      { project_id: project.id, user_id: context.userId, role: "user", content: data.initialRequest },
      {
        project_id: project.id,
        user_id: context.userId,
        role: "assistant",
        content: `${object.opening_message}\n\n**${object.first_question.text}**`,
        options: { pillar: object.first_question.pillar, choices: object.first_question.options },
      },
    ]);

    return { projectId: project.id };
  });

// 2. Discovery turn — process user reply, update requirements, ask next question
export const discoveryTurn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ projectId: z.string().uuid(), userReply: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: project } = await context.supabase
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .single();
    if (!project) throw new Error("Project not found");

    const { data: msgs } = await context.supabase
      .from("messages")
      .select("role, content")
      .eq("project_id", data.projectId)
      .order("created_at");

    await context.supabase.from("messages").insert({
      project_id: data.projectId,
      user_id: context.userId,
      role: "user",
      content: data.userReply,
    });

    const transcript = (msgs ?? [])
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");

    const object = await generateJson(
      z
        .object({
          updated_requirements: RequirementsSchema.optional(),
          discovery_complete: z.coerce.boolean().optional(),
          message: z.string().optional(),
          next_question: z
            .union([
              z.null(),
              z.string(),
              z
                .object({
                  text: z.string().optional(),
                  question: z.string().optional(),
                  pillar: z.string().optional(),
                  options: z.array(z.string()).optional(),
                })
                .passthrough(),
            ])
            .optional(),
        })
        .passthrough()
        .transform((raw) => {
          let nq: { text: string; pillar: string; options: string[] } | null = null;
          if (raw.next_question && typeof raw.next_question === "object") {
            const text = raw.next_question.text ?? raw.next_question.question;
            if (text) {
              nq = {
                text,
                pillar: raw.next_question.pillar ?? "processing",
                options: raw.next_question.options?.length
                  ? raw.next_question.options
                  : ["Yes", "No", "Other"],
              };
            }
          } else if (typeof raw.next_question === "string") {
            nq = { text: raw.next_question, pillar: "processing", options: ["Yes", "No", "Other"] };
          }
          return {
            updated_requirements: raw.updated_requirements ?? {},
            discovery_complete: raw.discovery_complete ?? false,
            message: raw.message ?? (nq ? "Thanks — one more question." : "Discovery complete."),
            next_question: nq,
          };
        }),
      `You are the Discovery Consultant for an automation project.

Domain: ${project.domain}
Initial request: ${project.initial_request}

Current structured requirements (JSON):
${JSON.stringify(project.requirements, null, 2)}

Conversation so far:
${transcript}
USER: ${data.userReply}

Update the requirements with anything new learned from the user's latest reply. The 7 pillars are: trigger, input_source, processing, decision_logic, outputs, notifications, scale. Keep each pillar value concise (1-2 sentences).

Return JSON with keys: updated_requirements (object with any of the 7 pillar keys as strings), discovery_complete (boolean), message (string), next_question (object with text, pillar, options[] — or null when discovery is complete).

Then decide: if all 7 pillars are sufficiently filled, set discovery_complete=true, next_question=null, and message = a short professional confirmation that discovery is ready. Otherwise, pick the most important pillar still missing or vague, write a clear single-question message (acknowledge previous answer, then ask), and provide 3-5 structured answer options in next_question.options (always include "Other").`,
    );

    const newReqs = { ...(project.requirements as Requirements), ...object.updated_requirements };
    const completion = computeCompletion(newReqs);

    await context.supabase
      .from("projects")
      .update({ requirements: newReqs, completion })
      .eq("id", data.projectId);

    const assistantText = object.next_question
      ? `${object.message}\n\n**${object.next_question.text}**`
      : object.message;

    await context.supabase.from("messages").insert({
      project_id: data.projectId,
      user_id: context.userId,
      role: "assistant",
      content: assistantText,
      options: object.next_question
        ? { pillar: object.next_question.pillar, choices: object.next_question.options }
        : null,
    });

    return { completion, requirements: newReqs, complete: object.discovery_complete };
  });

// 3. Generate three strategies
export const generateStrategies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: project } = await context.supabase
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .single();
    if (!project) throw new Error("Project not found");
    if ((project.completion ?? 0) < 85) throw new Error("Discovery must reach 85% before generating strategies");

    const fallbacks = fallbackStrategies(project);
    const object = await generateJson(
      z.unknown().transform((raw) => {
        const root = recordOf(raw);
        const rawStrategies = Array.isArray(root.strategies)
          ? root.strategies
          : [root.budget, root.recommended, root.enterprise].filter(Boolean);
        const tiers = ["budget", "recommended", "enterprise"] as const;
        return {
          strategies: tiers.map((tier, index) => normalizeStrategy(rawStrategies[index], tier, fallbacks[index])),
        };
      }),
      `You are a Solution Strategist. Domain: ${project.domain}.\nRequirements:\n${JSON.stringify(project.requirements, null, 2)}\n\nReturn JSON with exactly this shape: {"strategies":[{"tier":"budget","headline":"","monthly_cost_usd":0,"complexity":"Low","scalability":"Medium","stack":[""],"pros":[""],"cons":[""],"summary":""},{"tier":"recommended","headline":"","monthly_cost_usd":0,"complexity":"Medium","scalability":"High","stack":[""],"pros":[""],"cons":[""],"summary":""},{"tier":"enterprise","headline":"","monthly_cost_usd":0,"complexity":"High","scalability":"Very High","stack":[""],"pros":[""],"cons":[""],"summary":""}]}. Recommend realistic tools (Make.com, Zapier, OpenAI, Lovable Cloud, Postgres, Slack, Gmail, HubSpot, Airtable, AWS, etc.). Cost should be realistic monthly USD all-in. Be opinionated.`,
    ).catch((error) => {
      console.error("AI strategy generation failed", error);
      return { strategies: fallbacks };
    });

    await context.supabase.from("strategies").delete().eq("project_id", data.projectId);
    await context.supabase.from("strategies").insert(
      object.strategies.map((s) => ({
        project_id: data.projectId,
        user_id: context.userId,
        tier: s.tier,
        data: s,
      })),
    );
    await context.supabase.from("projects").update({ status: "strategy" }).eq("id", data.projectId);

    return { strategies: object.strategies };
  });

export const selectStrategy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ projectId: z.string().uuid(), tier: z.enum(["budget", "recommended", "enterprise"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("projects")
      .update({ selected_strategy: data.tier, status: "delivery" })
      .eq("id", data.projectId);
    return { ok: true };
  });

// 4. Generate a single deliverable on demand
const DELIVERABLE_KINDS = [
  "business_analysis",
  "architecture",
  "ai_agents",
  "make_workflow",
  "make_blueprint",
  "api_recommendations",
  "cost_estimate",
  "readiness_score",
  "consultant_recommendations",
  "roadmap",
  "proposal",
] as const;
type DeliverableKind = (typeof DELIVERABLE_KINDS)[number];

type ProjectSummary = {
  name?: string | null;
  domain?: string | null;
  initial_request?: string | null;
  requirements?: unknown;
  selected_strategy?: string | null;
};

function unwrapDeliverableRaw(raw: unknown, kind: DeliverableKind): Record<string, unknown> {
  const root = recordOf(raw);
  const nested = pick(root, [kind, "deliverable", "data", "result", "output"]);
  return Object.keys(recordOf(nested)).length ? recordOf(nested) : root;
}

function fallbackDeliverable(kind: DeliverableKind, project: ProjectSummary, selectedStrategy: unknown): Record<string, unknown> {
  const domain = project.domain ?? "Operations";
  const requirements = recordOf(project.requirements);
  const strategy = recordOf(selectedStrategy);
  const trigger = textValue(requirements.trigger, "the confirmed business trigger");
  const inputs = textValue(requirements.input_source, "the identified operational inputs");
  const processing = textValue(requirements.processing, "validation, enrichment, and structured workflow processing");
  const outputs = textValue(requirements.outputs, "the required outputs and status updates");
  const notifications = textValue(requirements.notifications, "stakeholder notifications and exception alerts");
  const scale = textValue(requirements.scale, "the expected operating volume");
  const stack = listValue(strategy.stack, ["Lovable Cloud", "Postgres", "AI processing", "Slack", "Gmail"]);
  const monthly = numberValue(strategy.monthly_cost_usd, 450);

  switch (kind) {
    case "business_analysis":
      return {
        current_state: `${domain} work is currently driven by ${trigger}, with inputs from ${inputs} and manual coordination around decisions and follow-up.`,
        future_state: `A structured automation captures each trigger, applies ${processing}, produces ${outputs}, and notifies teams through ${notifications}.`,
        pain_points: ["Manual handoffs slow response time", "Operational context is spread across systems", "Exceptions are difficult to audit consistently"],
        automation_opportunities: ["Standardize intake and validation", "Use AI-assisted classification and enrichment", "Automate updates, notifications, and reporting"],
        risks: ["Incomplete source data can reduce automation accuracy", "Integration permissions must be validated before build", "Exception paths need clear ownership"],
        assumptions: [`Expected scale: ${scale}`, "Users will review low-confidence exceptions", "Core systems expose usable API or workflow access"],
      };
    case "architecture":
      return {
        components: [
          { name: "Intake Layer (Make.com Webhook)", responsibility: `Receive every ${trigger} event`, why: `Decouples external producers from internal processing so producers can change without redeploying the workflow`, technology: "Make.com custom webhook" },
          { name: "Validation & Enrichment Service", responsibility: `Normalize and validate fields from ${inputs}`, why: "Guarantees downstream modules only see well-formed data, which makes AI prompts and DB inserts deterministic", technology: "Make.com data tools + scenario variables" },
          { name: "AI Processing Layer", responsibility: processing, why: "Centralizes prompts and model choice so accuracy can be improved without touching the rest of the pipeline", technology: "OpenAI / Lovable AI" },
          { name: "System of Record (Postgres)", responsibility: "Persist records, decisions, audit trail, and outputs", why: "Provides a single queryable source of truth for reporting, recovery, and compliance — webhooks alone cannot replay history", technology: "Lovable Cloud Postgres" },
          { name: "Notification & Approval Layer", responsibility: notifications, why: "Keeps humans in the loop for low-confidence and exception cases without blocking the happy path", technology: "Slack + Email" },
          { name: "Observability Layer", responsibility: "Execution logs, error alerts, run metrics", why: "Without it, silent failures in an automation are invisible until a stakeholder complains", technology: "Postgres log tables + Slack alerts" },
        ],
        data_flow: `${trigger} hits the webhook → validation normalizes the payload → AI layer classifies/extracts → router splits into auto/review/manual paths → Postgres stores the record and decision → notifications fan out to Slack/email → observability captures every step.`,
        integration_points: [
          { system: "Source system", direction: "Inbound", method: "Webhook (HTTPS POST)", auth: "Shared secret header", notes: "Validate signature before any processing" },
          { system: "OpenAI / Lovable AI", direction: "Outbound", method: "REST", auth: "Bearer API key (server-side secret)", notes: "Retry with exponential backoff" },
          { system: "Postgres", direction: "Outbound", method: "SQL via Make Postgres app", auth: "Connection string in Make vault", notes: "Use parameterized queries" },
          { system: "Slack", direction: "Outbound", method: "Slack API", auth: "OAuth app token", notes: "Channel routing by record type" },
        ],
        authentication: [
          { actor: "External producer → webhook", method: "Shared-secret HMAC header verified in the first Make module" },
          { actor: "Operators → app UI", method: "Lovable Cloud auth (email + Google OAuth) with row-level security on Postgres" },
          { actor: "Server → third-party APIs", method: "Vaulted API keys stored in Make.com connections, never in scenario blueprints" },
        ],
        data_storage: {
          primary: "Postgres for transactional records, decisions, and audit trail — chosen because the workflow needs relational queries, RLS, and replay.",
          secondary: "Airtable 'failed_records' base for triage queues — chosen because operators need a low-friction UI to fix bad payloads without SQL access.",
          retention: "Records: 24 months hot, then archive. Logs: 90 days. Failed payloads: 30 days or until resolved.",
          pii_handling: "PII fields encrypted at rest, redacted before sending to AI prompts, never written to log tables.",
        },
        failure_points: [
          { point: "Webhook delivery", impact: "Lost events", mitigation: "Producer-side retry + idempotency key stored in Postgres" },
          { point: "AI provider timeout or empty response", impact: "Records stall", mitigation: "Retry once, then route to manual review with the raw payload" },
          { point: "Postgres write failure", impact: "Decision made but not persisted", mitigation: "Push payload to failed_records queue, alert ops, replay via admin tool" },
          { point: "Slack outage", impact: "Approvers not notified", mitigation: "Fallback to email + dashboard badge so approvals are not silently delayed" },
        ],
        recovery_strategy: "Every inbound event is stored with an idempotency key before processing, so any failed step can be replayed safely. A daily reconciliation job compares webhook receipts against persisted records and re-queues any gaps.",
        scalability: [
          "Make.com scenarios scale horizontally by operation budget — split the scenario by router path once volume exceeds 10k runs/day",
          "Postgres: add indexes on (status, created_at) and (record_id) for queue queries; introduce a read replica for reporting at ~1M rows",
          "AI layer: batch low-priority classification calls; cache deterministic prompts to cut spend at scale",
        ],
        security: [
          "Webhook HMAC signature verification before processing",
          "Row-level security on every user-facing table (auth.uid() scoping)",
          "Secrets stored in Make.com vault / Lovable Cloud env — never in code or scenario JSON",
          "PII redaction before AI calls; audit log of every prompt + response",
          "Least-privilege Postgres role for the Make connection (no DDL, no service-role)",
        ],
        systems: stack,
        integrations: stack.filter((item) => !/postgres|database/i.test(item)),
        mermaid: "flowchart TD\n  A[Trigger Event] --> B[Webhook + HMAC Verify]\n  B --> C[Validate & Enrich]\n  C --> D[AI Processing]\n  D --> E{Router}\n  E -->|Auto| F[Persist + Notify]\n  E -->|Review| G[Approval Queue]\n  E -->|Manual| H[Failed Records]\n  F --> I[(Postgres)]\n  G --> I\n  H --> I\n  I --> J[Observability]",
      };
    case "ai_agents":
      return {
        agents: [
          {
            name: "Intake Classifier Agent",
            purpose: `Classify incoming ${domain} work and extract structured fields from ${inputs}`,
            trigger: `New record arrives from ${trigger}`,
            inputs: [inputs, "Source metadata", "Submission timestamp"],
            outputs: ["Normalized record JSON", "Category label", "Confidence score (0-1)"],
            prompt_strategy: "Few-shot extraction. System prompt defines the JSON schema and category enum; user prompt contains the raw payload. Temperature 0.1. Require strict JSON output with required-field validation.",
            decision_logic: [
              "confidence >= 0.85 → forward to downstream automation",
              "0.5 <= confidence < 0.85 → send to Review Assistant",
              "confidence < 0.5 OR missing required field → escalate to human",
            ],
            failure_handling: "On invalid JSON, retry once with a stricter format instruction. On second failure, store payload in failed_records and notify the operations channel.",
            human_escalation: "Escalate to the operations reviewer when required fields are missing or category is 'unknown'. SLA 4 business hours.",
            example_prompt: `You are an intake classifier for ${domain}. Given the input below, return JSON: {"category": one of [standard, priority, exception], "fields": {...}, "confidence": 0-1, "reasoning": ""}. Reject input that is missing required fields by returning {"category":"unknown","missing":[...]}\n\nInput:\n<<payload>>`,
          },
          {
            name: "Decision Assistant Agent",
            purpose: `Apply business rules to recommend the next action and produce ${outputs}`,
            trigger: "Normalized record passes the classifier with confidence >= 0.5",
            inputs: ["Normalized record", "Project decision rules", "Historical context (last 5 similar cases)"],
            outputs: ["Recommended action", "Rationale", "Confidence score", "Suggested approver (if needed)"],
            prompt_strategy: "Chain-of-thought with rule grounding. System prompt embeds the rule table; user prompt contains the record and history. Temperature 0.2. Require the model to cite which rule fired.",
            decision_logic: [
              "Rule match + confidence >= 0.8 → auto-execute action",
              "Rule match + confidence < 0.8 → queue for human approval",
              "No rule match → escalate with rationale",
            ],
            failure_handling: "If the model returns no rule citation, retry with a 'must cite a rule' instruction. After two failures, route to manual review with the full prompt/response captured.",
            human_escalation: "Escalate when no rule fires, when the recommended action is irreversible, or when confidence < 0.8. Approver: operations lead.",
            example_prompt: `You are the Decision Assistant for ${domain}. Apply the rules below and recommend an action.\n\nRules:\n<<rule_table>>\n\nRecord:\n<<normalized_record>>\n\nRespond as JSON: {"action":"","rule_id":"","confidence":0-1,"rationale":"","needs_approval":bool}`,
          },
        ],
      };
    case "make_workflow":
      return {
        trigger: {
          module_name: "Capture intake event",
          module_type: "Webhooks > Custom webhook",
          configuration: `Listens for ${trigger}. Use a dedicated webhook URL stored in Make.com; validate the shared secret header before processing.`,
          input_data: [
            { field: "record_id", type: "string", required: true },
            { field: "source", type: "string", required: true },
            { field: "payload", type: "collection", required: true },
            { field: "received_at", type: "date", required: true },
          ],
        },
        processing_modules: [
          {
            number: 1,
            name: "Validate payload",
            app: "Tools > Set multiple variables",
            purpose: `Normalize and validate required fields from ${inputs}`,
            input_mapping: [
              { field: "record_id", source: "{{1.record_id}}" },
              { field: "payload", source: "{{1.payload}}" },
            ],
            output_mapping: [
              { field: "normalized_record", destination: "scenario variable" },
              { field: "validation_status", destination: "scenario variable" },
            ],
          },
          {
            number: 2,
            name: "AI processing",
            app: "OpenAI > Create a completion",
            purpose: processing,
            input_mapping: [
              { field: "prompt", source: "{{2.normalized_record}}" },
            ],
            output_mapping: [
              { field: "classification", destination: "scenario variable" },
              { field: "confidence", destination: "scenario variable" },
            ],
          },
          {
            number: 3,
            name: "Persist record",
            app: "Postgres > Insert a row",
            purpose: `Store ${outputs} with full audit metadata`,
            input_mapping: [
              { field: "record_id", source: "{{1.record_id}}" },
              { field: "classification", source: "{{2.classification}}" },
              { field: "confidence", source: "{{2.confidence}}" },
            ],
            output_mapping: [
              { field: "row_id", destination: "scenario variable" },
            ],
          },
          {
            number: 4,
            name: "Notify stakeholders",
            app: "Slack > Create a message",
            purpose: notifications,
            input_mapping: [
              { field: "channel", source: "#automation-events" },
              { field: "text", source: "Record {{3.row_id}} processed ({{2.classification}})" },
            ],
            output_mapping: [
              { field: "message_ts", destination: "scenario variable" },
            ],
          },
        ],
        filters: [
          {
            name: "Qualified record",
            conditions: [
              { field: "validation_status", operator: "equal to", value: "valid", logic: "AND" },
              { field: "confidence", operator: "greater than", value: "0.7" },
            ],
          },
        ],
        routers: [
          { path: "Path A — Auto-process", condition: "confidence >= 0.85", description: "Run end-to-end automation with no human touch" },
          { path: "Path B — Review queue", condition: "0.5 <= confidence < 0.85", description: "Send to reviewer for confirmation before persisting" },
          { path: "Path C — Manual handling", condition: "confidence < 0.5 OR validation_status = invalid", description: "Escalate to operations and store the raw payload" },
        ],
        error_handling: {
          retry_logic: "Wrap each external API module in a Break error handler with 3 retries and exponential backoff (30s, 2m, 5m).",
          validation_checks: [
            "Required webhook fields are present and typed",
            "AI response includes a numeric confidence score",
            "Database insert returns a row_id",
          ],
          exception_paths: [
            "Validation failure → route to Path C and tag the record as 'invalid_input'",
            "AI timeout or empty response → retry once, then escalate",
            "Database error → push the payload to the failed-records queue",
          ],
          failed_record_storage: "Append failed payloads with error context to a 'failed_records' Airtable base for triage.",
        },
        logging: {
          execution_log: "Write start, end, duration, and module status for every scenario run to a Postgres 'execution_log' table.",
          error_log: "Send error events (module, message, payload hash) to a Slack #automation-errors channel and the 'error_log' table.",
          audit_trail: "Persist trigger payload hash, AI prompt, AI response, decisions, and approver ID per record for compliance review.",
        },
        human_approval: [
          {
            step: "Review queue confirmation",
            approver: "Operations reviewer (rotating duty)",
            escalation: "If no decision within 4 business hours, escalate to the operations lead via email and Slack DM.",
          },
        ],
      };
    case "api_recommendations":
      return {
        apis: stack.map((name) => ({
          name,
          purpose: `Support the ${domain} automation workflow`,
          why_selected: `${name} is the most direct fit for the selected ${project.selected_strategy ?? "recommended"} stack and integrates cleanly with the other tools in the architecture.`,
          auth: "OAuth 2.0 (preferred) or scoped API key stored in the secrets manager",
          alternatives: ["Comparable vendor A", "Comparable vendor B"],
          cost_estimate: "Usage-based; confirm tier against expected monthly volume",
          risks: "Rate limits, scope changes, and sandbox vs production parity",
          scaling: "Monitor request volume, batch where possible, and add caching for hot reads",
        })),
      };
    case "cost_estimate": {
      const lowMult = 0.35;
      const highMult = 2.2;
      const lineItems = [
        {
          category: "AI processing (OpenAI)",
          component: "gpt-4o-mini for classification/extraction",
          unit: "per 1K input + output tokens",
          unit_cost_usd: 0.0009,
          low: { volume: "200K tokens / mo", monthly_usd: Math.round(monthly * 0.18 * lowMult) },
          medium: { volume: "1.2M tokens / mo", monthly_usd: Math.round(monthly * 0.18) },
          high: { volume: "5M tokens / mo", monthly_usd: Math.round(monthly * 0.18 * highMult) },
          note: "Use prompt caching and route simple cases to a cheaper model.",
        },
        {
          category: "Automation (Make.com)",
          component: "Core / Pro plan operations",
          unit: "per operation",
          unit_cost_usd: 0.0007,
          low: { volume: "10K ops / mo", monthly_usd: Math.round(monthly * 0.15 * lowMult) },
          medium: { volume: "40K ops / mo", monthly_usd: Math.round(monthly * 0.15) },
          high: { volume: "150K ops / mo", monthly_usd: Math.round(monthly * 0.15 * highMult) },
          note: "Batch records inside scenarios; avoid per-record routers when possible.",
        },
        {
          category: "CRM (HubSpot / Salesforce)",
          component: "Seats + Marketing/Sales Hub tier",
          unit: "per seat / mo",
          unit_cost_usd: 50,
          low: { volume: "Starter, 2 seats", monthly_usd: Math.round(monthly * 0.22 * lowMult) },
          medium: { volume: "Professional, 5 seats", monthly_usd: Math.round(monthly * 0.22) },
          high: { volume: "Enterprise, 15 seats", monthly_usd: Math.round(monthly * 0.22 * highMult) },
          note: "API call limits scale with tier — confirm against expected volume.",
        },
        {
          category: "Hosting & database",
          component: "App hosting + managed Postgres + object storage",
          unit: "per month",
          unit_cost_usd: 0,
          low: { volume: "Shared / small instance", monthly_usd: Math.round(monthly * 0.2 * lowMult) },
          medium: { volume: "Dedicated small + 50GB DB", monthly_usd: Math.round(monthly * 0.2) },
          high: { volume: "HA cluster + 250GB DB", monthly_usd: Math.round(monthly * 0.2 * highMult) },
          note: "Largest jump usually comes from DB IOPS and outbound bandwidth.",
        },
        {
          category: "Monitoring & buffer",
          component: "Logs, alerting, error tracking, ops margin",
          unit: "per month",
          unit_cost_usd: 0,
          low: { volume: "Free tiers + Slack alerts", monthly_usd: Math.round(monthly * 0.1 * lowMult) },
          medium: { volume: "Paid logs + on-call rotation", monthly_usd: Math.round(monthly * 0.1) },
          high: { volume: "Full observability stack", monthly_usd: Math.round(monthly * 0.1 * highMult) },
          note: "Hold 10-15% as buffer for retries, spikes, and vendor price changes.",
        },
      ];
      const sum = (t: "low" | "medium" | "high") =>
        lineItems.reduce((s, li) => s + ((li as any)[t]?.monthly_usd ?? 0), 0);
      const totals = {
        low: { monthly_usd: sum("low"), annual_usd: sum("low") * 12 },
        medium: { monthly_usd: sum("medium"), annual_usd: sum("medium") * 12 },
        high: { monthly_usd: sum("high"), annual_usd: sum("high") * 12 },
      };
      return {
        assumptions: [
          `Domain: ${domain} workflow at ${scale} expected baseline volume.`,
          "Pricing in USD, list prices, before negotiated discounts.",
          "OpenAI tokens assume ~70% input / 30% output split on gpt-4o-mini class models.",
          "Make.com pricing assumes Pro plan; ops include routers and aggregators.",
          "CRM seats and tier scale with the size of the operating team, not record volume.",
        ],
        volume_drivers: [
          { driver: "Trigger events / month", low: "1K", medium: "10K", high: "50K", unit: "records" },
          { driver: "AI calls per record", low: "1", medium: "2", high: "4", unit: "calls" },
          { driver: "Make.com ops per record", low: "4", medium: "8", high: "15", unit: "ops" },
          { driver: "CRM writes per record", low: "1", medium: "2", high: "3", unit: "writes" },
        ],
        line_items: lineItems,
        totals,
        breakdown: lineItems.map((li) => ({
          category: li.category,
          monthly_usd: li.medium.monthly_usd,
          note: li.note,
        })),
        monthly_total_usd: totals.medium.monthly_usd,
        annual_total_usd: totals.medium.annual_usd,
        growth_scenario:
          "Doubling baseline volume in 12 months pushes AI and Make.com costs up roughly linearly, while CRM and hosting step up in tiers — expect ~1.6-1.8x medium total, not 2x.",
        notes:
          "Refresh after confirming integration volumes, data retention, approval SLAs, and any negotiated vendor pricing.",
      };
    }
    case "readiness_score": {
      const factors = [
        { name: "Requirement Completeness", score: 80, weight: 0.22, rationale: `Core trigger, inputs, and outputs are defined (${trigger} → ${outputs}); confirm edge cases and SLAs before build.`, gaps: ["Document edge cases for invalid inputs", "Confirm SLA targets with the business owner"] },
        { name: "Integration Availability", score: 75, weight: 0.20, rationale: `Selected stack (${stack.slice(0, 3).join(", ")}) exposes the needed APIs, but credentials and scopes still need provisioning.`, gaps: ["Provision API credentials in each environment", "Validate required OAuth scopes / webhook permissions"] },
        { name: "Data Quality", score: 70, weight: 0.20, rationale: `Source data from ${inputs} is workable but inconsistent fields will reduce AI accuracy without normalization.`, gaps: ["Profile a representative sample of source records", "Define required vs optional fields and defaults"] },
        { name: "Human Approval Logic", score: 85, weight: 0.18, rationale: "Approval steps and exception routing are identified; ownership and escalation SLAs must be confirmed.", gaps: ["Assign named approvers per exception path", "Define escalation SLA and after-hours fallback"] },
        { name: "Error Handling Coverage", score: 78, weight: 0.20, rationale: "Retry, validation, and failed-record storage are designed; reconciliation and replay procedures still need definition.", gaps: ["Define reconciliation cadence for failed records", "Document replay procedure with idempotency keys"] },
      ];
      const overall = Math.round(factors.reduce((s, f) => s + f.score * f.weight, 0));
      return {
        overall_score: overall,
        verdict: overall >= 85 ? "Ready to build" : overall >= 70 ? "Ready with gaps to close" : "Not ready — close gaps first",
        factors,
        top_gaps: factors.flatMap((f) => f.gaps).slice(0, 5),
        blockers: ["Missing API credentials in target environments", "Unconfirmed exception ownership"],
        recommended_next_steps: [
          "Schedule a 60-minute requirements confirmation with the business owner",
          "Run a data profiling pass on a 500-record sample",
          "Provision sandbox credentials for all integrations",
          "Confirm approver list and escalation SLAs in writing",
        ],
      };
    }
    case "consultant_recommendations": {
      return {
        executive_summary: `Based on the discovery for ${project.name ?? "this project"}, the ${domain} automation is viable on the selected stack (${stack.slice(0, 3).join(", ")}), with focused work needed on data quality, exception ownership, and observability before scaling.`,
        key_risks: [
          { risk: `Source data from ${inputs} is inconsistent`, impact: "High", likelihood: "High", mitigation: "Profile a 500-record sample, define required fields and defaults, add schema validation at intake." },
          { risk: "API rate limits during peak volume", impact: "Medium", likelihood: "Medium", mitigation: "Add request batching, exponential backoff, and a queue between trigger and processing modules." },
          { risk: "Exception ownership is undefined", impact: "High", likelihood: "Medium", mitigation: "Assign named approvers per exception path with a written SLA and after-hours fallback." },
          { risk: "AI output drift over time", impact: "Medium", likelihood: "Medium", mitigation: "Pin model versions, log prompt/response pairs, run a weekly sample review against a labeled set." },
        ],
        recommended_improvements: [
          { area: "Data quality", recommendation: "Add a validation module before AI processing that rejects or quarantines malformed records.", rationale: "Prevents silent failures and reduces AI hallucination on incomplete input.", effort: "S" },
          { area: "Observability", recommendation: "Stream execution logs and errors to a single dashboard with alerting on failure-rate thresholds.", rationale: "Operators need one place to see health; without it, regressions go unnoticed for days.", effort: "M" },
          { area: "Approval workflow", recommendation: "Move human approvals into a structured queue (e.g. Slack with action buttons) rather than email.", rationale: "Email approvals lose audit trail and slow SLA; structured queues are measurable.", effort: "M" },
        ],
        quick_wins: [
          { win: "Add an idempotency key on the intake webhook", value: "Eliminates duplicate processing from retries within a day of work.", effort: "S" },
          { win: "Set up a daily exception digest to the business owner", value: "Surfaces edge cases early without requiring dashboard adoption.", effort: "S" },
          { win: "Cache static reference lookups (CRM stages, owners)", value: "Cuts API calls 30-50% and reduces rate-limit risk immediately.", effort: "S" },
        ],
        future_enhancements: [
          { enhancement: "Lead/record scoring with a tuned model", value: "Improves routing precision and reduces manual review load.", when: "Post-launch, after 30 days of labeled outcomes." },
          { enhancement: "Self-service rule editor for business users", value: "Removes engineering from routine threshold and routing changes.", when: "Quarter 2, once core flow is stable." },
          { enhancement: "Cross-system reconciliation report", value: "Confirms parity between source-of-truth systems and surfaces silent drift.", when: "Once volume exceeds the high tier in the cost model." },
        ],
        technical_debt_risks: [
          { debt: "Hard-coded credentials and config inside Make.com modules", consequence: "Rotation requires touching every module; secrets leak through scenario exports.", remediation: "Move secrets to a vault / data store, reference by name in modules." },
          { debt: "Prompt logic embedded in workflow nodes", consequence: "Prompt changes can't be versioned or A/B tested and require editing the scenario.", remediation: "Externalize prompts to a versioned data store with a single fetch module." },
          { debt: "No automated regression tests for the scenario", consequence: "Every change risks silent regressions; rollbacks are manual.", remediation: "Add a canary scenario that replays a fixed payload set on each change." },
        ],
        closing_note: `Address the high-impact risks and quick wins before launch; defer future enhancements until post-launch metrics justify them.`,
      };
    }
    case "make_blueprint": {
      const projName = project.name ?? "Automation";
      const tree = [
        "Webhook (Trigger)",
        "  ↓",
        "Validate Input",
        "  ↓",
        "Enrich + AI Scoring",
        "  ↓",
        "Router",
        "  ├─ High Score → Slack #sales-hot + HubSpot (Create Deal)",
        "  ├─ Medium Score → Nurture Queue (Data Store) + Mailchimp Sequence",
        "  └─ Low Score → Archive Data Store + Weekly Digest",
        "  ↓",
        "Error Handler (Break + Resume) → failed_records store",
        "  ↓",
        "Human Approval (Slack action buttons, 4h SLA)",
        "  ↓",
        "Audit Log → Postgres execution_log",
      ].join("\n");
      return {
        scenario_name: `${projName} — Make.com Blueprint`,
        description: `Implementation-ready Make.com scenario for ${domain}. Reads ${trigger}, validates, scores, routes by outcome, and writes ${outputs} with full audit + approval coverage.`,
        module_sequence: [
          { number: 1, type: "trigger", name: "Capture intake event", app: "Webhooks > Custom webhook", purpose: `Receive ${trigger} payloads with shared-secret header.`, notes: "Reject any request missing the secret header before any downstream module runs." },
          { number: 2, type: "action", name: "Validate input", app: "Tools > Set multiple variables + Filter", purpose: "Coerce types, enforce required fields, attach validation_status flag.", notes: "Missing required field → route to failed_records store." },
          { number: 3, type: "action", name: "Enrich record", app: "HTTP > Make a request", purpose: "Look up firmographics / account context from enrichment API.", notes: "Cache results in lookup_cache data store for 24h." },
          { number: 4, type: "action", name: "Score record", app: "OpenAI > Create a completion", purpose: "Return numeric score (0-100) + reason; temperature 0.2.", notes: "Pin model version; log prompt + response hash to audit." },
          { number: 5, type: "router", name: "Route by score", app: "Flow Control > Router", purpose: "Three branches: High (>=80), Medium (50-79), Low (<50).", notes: "First matching branch wins; default branch is Low." },
          { number: 6, type: "action", name: "High path — notify + create deal", app: "Slack + HubSpot", purpose: "Post to #sales-hot and create Deal in HubSpot.", notes: "Run in parallel; on either failure, fall through to error handler." },
          { number: 7, type: "data_store", name: "Medium path — nurture queue", app: "Data Stores > Add a record", purpose: "Queue record for Mailchimp nurture sequence enrollment.", notes: "Unique key = record_id; upsert to avoid duplicates." },
          { number: 8, type: "data_store", name: "Low path — archive", app: "Data Stores > Add a record", purpose: "Store for weekly digest; no immediate action.", notes: "Retain 90 days, then purge via scheduled scenario." },
          { number: 9, type: "approval", name: "Human approval (high-value only)", app: "Slack > Create message with actions", purpose: "Require manager approval if deal_value > $25K.", notes: "4h SLA, escalate to VP after timeout." },
          { number: 10, type: "action", name: "Audit log write", app: "Postgres > Insert a row", purpose: "Persist execution metadata + decisions.", notes: "Includes scenario_id, run_id, branch_taken, approver_id." },
        ],
        filters: [
          { name: "Required-fields check", after_module: 2, conditions: [
            { field: "validation_status", operator: "equal to", value: "valid" },
            { field: "payload.email", operator: "exists", value: "true" },
          ] },
          { name: "High-value gate", after_module: 5, conditions: [
            { field: "deal_value_usd", operator: "greater than", value: "25000" },
          ] },
        ],
        routers: [
          { name: "Score router", after_module: 5, branches: [
            { label: "High Score", condition: "score >= 80", modules: ["Slack post", "HubSpot Create Deal"], outcome: "Immediate sales engagement." },
            { label: "Medium Score", condition: "score >= 50 AND score < 80", modules: ["Nurture Queue (data store)", "Mailchimp sequence enrollment"], outcome: "Long-term nurture, re-score in 30 days." },
            { label: "Low Score", condition: "score < 50", modules: ["Archive data store"], outcome: "No active outreach; weekly digest only." },
          ] },
        ],
        error_handlers: [
          { module: "Enrich record (HTTP)", strategy: "Break with 3 retries, exponential backoff (30s/2m/5m)", fallback: "Continue with partial enrichment flagged enrichment_status='partial'." },
          { module: "Score record (OpenAI)", strategy: "Break with 2 retries, then Resume with default score=null", fallback: "Route to Medium branch and tag for human review." },
          { module: "HubSpot Create Deal", strategy: "Rollback the Deal create, keep Slack notification", fallback: "Push payload to failed_records store with error context." },
          { module: "Postgres audit insert", strategy: "Ignore and continue (idempotent retry via scheduled reconciliation)", fallback: "Backfill from execution_log replay job nightly." },
        ],
        data_stores: [
          { name: "lookup_cache", purpose: "24h cache of enrichment API responses to cut cost and rate-limit risk.", fields: [{ name: "domain", type: "string" }, { name: "payload", type: "collection" }, { name: "fetched_at", type: "date" }] },
          { name: "nurture_queue", purpose: "Holds Medium-Score records pending Mailchimp enrollment + 30-day re-score.", fields: [{ name: "record_id", type: "string" }, { name: "score", type: "number" }, { name: "next_review_at", type: "date" }] },
          { name: "archive", purpose: "Cold storage of Low-Score records for digest reporting and audit.", fields: [{ name: "record_id", type: "string" }, { name: "score", type: "number" }, { name: "reason", type: "string" }] },
          { name: "failed_records", purpose: "Quarantine for payloads that hit unrecoverable errors; triaged manually.", fields: [{ name: "record_id", type: "string" }, { name: "module", type: "string" }, { name: "error", type: "string" }, { name: "payload", type: "collection" }] },
        ],
        human_approval_steps: [
          { step: "High-value deal approval", approver: "Sales Manager", channel: "Slack #sales-approvals (action buttons)", sla: "4 business hours", escalation: "Escalate to VP Sales via Slack DM + email after SLA breach." },
          { step: "Exception triage", approver: "Operations Lead", channel: "Email digest from failed_records store", sla: "1 business day", escalation: "Page on-call engineer if backlog > 25 records." },
        ],
        tree_diagram: tree,
      };
    }
    case "roadmap":
      return {
        phases: [
          { name: "Discovery validation", duration: "1 week", deliverables: ["Confirmed requirements", "Integration access checklist"], milestones: ["Approve workflow scope", "Confirm exception owners"] },
          { name: "MVP build", duration: "2-3 weeks", deliverables: ["Working automation", "Data model", "Notification paths"], milestones: ["End-to-end test run", "User acceptance review"] },
          { name: "Hardening and launch", duration: "1-2 weeks", deliverables: ["Monitoring", "Runbook", "Launch support"], milestones: ["Production cutover", "30-day optimization plan"] },
        ],
        dependencies: ["System access and API permissions", "Sample data for testing", "Decision owner availability"],
        risks: ["Source data quality", "Integration rate limits", "Unclear exception handling rules"],
      };
    case "proposal":
      return {
        overview: `Implement a ${domain} automation for ${project.name ?? "the project"} that turns ${trigger} into ${outputs}.`,
        scope: ["Workflow intake and validation", "AI-assisted processing and routing", "Output generation", "Notifications, logging, and exception handling"],
        deliverables: ["Configured automation workflow", "Data and integration design", "AI agent prompts and safeguards", "Cost estimate and implementation roadmap"],
        timeline: "4-6 weeks depending on integration access and review cycles.",
        assumptions: [`Expected scale is ${scale}`, "Client provides access to required systems", "A business owner approves exception handling rules"],
        success_metrics: ["Reduced manual handling time", "Improved response consistency", "Clear audit trail for each run", "Lower exception backlog"],
      };
  }
}

function normalizeDeliverable(kind: DeliverableKind, raw: unknown, fallback: Record<string, unknown>): Record<string, unknown> {
  const item = unwrapDeliverableRaw(raw, kind);
  const fb = fallback as any;
  switch (kind) {
    case "business_analysis":
      return {
        current_state: textValue(pick(item, ["current_state", "currentState", "as_is", "current"]), fb.current_state),
        future_state: textValue(pick(item, ["future_state", "futureState", "to_be", "future"]), fb.future_state),
        pain_points: listValue(pick(item, ["pain_points", "painPoints", "problems"]), fb.pain_points),
        automation_opportunities: listValue(pick(item, ["automation_opportunities", "automationOpportunities", "opportunities"]), fb.automation_opportunities),
        risks: listValue(item.risks, fb.risks),
        assumptions: listValue(item.assumptions, fb.assumptions),
      };
    case "architecture": {
      const fbA = fb as any;
      const componentsRaw = Array.isArray(item.components) ? item.components : fbA.components;
      const components = componentsRaw.map((c: unknown, i: number) => {
        if (typeof c === "string") return { name: c, responsibility: "Core workflow component", why: "", technology: "" };
        const r = recordOf(c);
        return {
          name: textValue(pick(r, ["name", "component"]), `Component ${i + 1}`),
          responsibility: textValue(pick(r, ["responsibility", "purpose", "role"]), "Core workflow component"),
          why: textValue(pick(r, ["why", "rationale", "reason", "justification"]), ""),
          technology: textValue(pick(r, ["technology", "tech", "stack", "tool"]), ""),
        };
      });

      const ipRaw = Array.isArray(pick(item, ["integration_points", "integrationPoints"])) ? (pick(item, ["integration_points", "integrationPoints"]) as unknown[]) : fbA.integration_points;
      const integration_points = ipRaw.map((p: unknown, i: number) => {
        const r = recordOf(p);
        return {
          system: textValue(pick(r, ["system", "name"]), `System ${i + 1}`),
          direction: textValue(r.direction, "Outbound"),
          method: textValue(pick(r, ["method", "protocol"]), "REST"),
          auth: textValue(r.auth, "API key"),
          notes: textValue(r.notes, ""),
        };
      });

      const authRaw = Array.isArray(item.authentication) ? item.authentication : fbA.authentication;
      const authentication = authRaw.map((a: unknown, i: number) => {
        if (typeof a === "string") return { actor: `Actor ${i + 1}`, method: a };
        const r = recordOf(a);
        return { actor: textValue(pick(r, ["actor", "who", "subject"]), `Actor ${i + 1}`), method: textValue(pick(r, ["method", "how"]), "API key") };
      });

      const dsRaw = recordOf(pick(item, ["data_storage", "dataStorage", "storage"]));
      const data_storage = {
        primary: textValue(dsRaw.primary, fbA.data_storage.primary),
        secondary: textValue(dsRaw.secondary, fbA.data_storage.secondary),
        retention: textValue(dsRaw.retention, fbA.data_storage.retention),
        pii_handling: textValue(pick(dsRaw, ["pii_handling", "piiHandling", "pii"]), fbA.data_storage.pii_handling),
      };

      const fpRaw = Array.isArray(pick(item, ["failure_points", "failurePoints", "failures"])) ? (pick(item, ["failure_points", "failurePoints", "failures"]) as unknown[]) : fbA.failure_points;
      const failure_points = fpRaw.map((p: unknown, i: number) => {
        if (typeof p === "string") return { point: p, impact: "", mitigation: "" };
        const r = recordOf(p);
        return {
          point: textValue(pick(r, ["point", "name", "failure"]), `Failure ${i + 1}`),
          impact: textValue(r.impact, ""),
          mitigation: textValue(pick(r, ["mitigation", "remediation", "handling"]), ""),
        };
      });

      return {
        components,
        data_flow: textValue(pick(item, ["data_flow", "dataFlow", "flow"]), fbA.data_flow),
        integration_points,
        authentication,
        data_storage,
        failure_points,
        recovery_strategy: textValue(pick(item, ["recovery_strategy", "recoveryStrategy", "recovery"]), fbA.recovery_strategy),
        scalability: listValue(pick(item, ["scalability", "scalability_recommendations", "scalabilityRecommendations"]), fbA.scalability),
        security: listValue(pick(item, ["security", "security_considerations", "securityConsiderations"]), fbA.security),
        systems: listValue(item.systems ?? item.stack, fbA.systems),
        integrations: listValue(item.integrations, fbA.integrations),
        mermaid: textValue(item.mermaid, fbA.mermaid).replace(/```mermaid|```/g, "").trim(),
      };
    }
    case "ai_agents": {
      const fbAgents = (fb as any).agents as any[];
      const agents = Array.isArray(item.agents) ? item.agents.map((agent, index) => {
        const a = recordOf(agent);
        const fbA = fbAgents[index] ?? fbAgents[0];
        return {
          name: textValue(a.name, fbA.name),
          purpose: textValue(a.purpose, fbA.purpose),
          trigger: textValue(pick(a, ["trigger", "when", "invocation"]), fbA.trigger),
          inputs: listValue(a.inputs, fbA.inputs),
          outputs: listValue(a.outputs, fbA.outputs),
          prompt_strategy: textValue(pick(a, ["prompt_strategy", "promptStrategy", "prompt"]), fbA.prompt_strategy),
          decision_logic: listValue(pick(a, ["decision_logic", "decisionLogic", "decision_rules", "decisionRules", "rules"]), fbA.decision_logic),
          failure_handling: textValue(pick(a, ["failure_handling", "failureHandling", "fallback"]), fbA.failure_handling),
          human_escalation: textValue(pick(a, ["human_escalation", "humanEscalation", "escalation", "escalation_rules", "escalationRules"]), fbA.human_escalation),
          example_prompt: textValue(pick(a, ["example_prompt", "examplePrompt", "sample_prompt", "samplePrompt"]), fbA.example_prompt),
        };
      }) : fbAgents;
      return { agents };
    }
    case "make_workflow": {
      const fbMW = fb as any;
      const triggerRaw = recordOf(pick(item, ["trigger"]));
      const triggerInputRaw = Array.isArray(triggerRaw.input_data) ? triggerRaw.input_data : fbMW.trigger.input_data;
      const trigger = {
        module_name: textValue(pick(triggerRaw, ["module_name", "moduleName", "name"]), fbMW.trigger.module_name),
        module_type: textValue(pick(triggerRaw, ["module_type", "moduleType", "type"]), fbMW.trigger.module_type),
        configuration: textValue(triggerRaw.configuration, fbMW.trigger.configuration),
        input_data: triggerInputRaw.map((f: unknown, i: number) => {
          const r = recordOf(f);
          return {
            field: textValue(pick(r, ["field", "name"]), `field_${i + 1}`),
            type: textValue(r.type, "string"),
            required: typeof r.required === "boolean" ? r.required : true,
          };
        }),
      };

      const procRaw = Array.isArray(pick(item, ["processing_modules", "processingModules", "modules", "steps"]))
        ? (pick(item, ["processing_modules", "processingModules", "modules", "steps"]) as unknown[])
        : fbMW.processing_modules;
      const processing_modules = procRaw.map((m: unknown, i: number) => {
        const r = recordOf(m);
        const inMap = Array.isArray(pick(r, ["input_mapping", "inputMapping", "inputs"]))
          ? (pick(r, ["input_mapping", "inputMapping", "inputs"]) as unknown[])
          : [];
        const outMap = Array.isArray(pick(r, ["output_mapping", "outputMapping", "outputs"]))
          ? (pick(r, ["output_mapping", "outputMapping", "outputs"]) as unknown[])
          : [];
        const mapPairs = (rows: unknown[], destKey: "source" | "destination", fallbackDest: string) =>
          rows.map((row, idx) => {
            if (typeof row === "string") return { field: `field_${idx + 1}`, [destKey]: row } as any;
            const rr = recordOf(row);
            return {
              field: textValue(pick(rr, ["field", "name", "key"]), `field_${idx + 1}`),
              [destKey]: textValue(pick(rr, [destKey, "value", "mapping", "from", "to"]), fallbackDest),
            } as any;
          });
        return {
          number: numberValue(pick(r, ["number", "module_number", "step"]), i + 1),
          name: textValue(r.name, `Module ${i + 1}`),
          app: textValue(pick(r, ["app", "module", "make_app", "service"]), "Make.com module"),
          purpose: textValue(pick(r, ["purpose", "action", "description"]), "Process the workflow item"),
          input_mapping: inMap.length ? mapPairs(inMap, "source", "{{previous.value}}") : [{ field: "value", source: "{{previous.value}}" }],
          output_mapping: outMap.length ? mapPairs(outMap, "destination", "scenario variable") : [{ field: "result", destination: "scenario variable" }],
        };
      });

      const filtersRaw = Array.isArray(item.filters) ? item.filters : fbMW.filters;
      const filters = filtersRaw.map((f: unknown, i: number) => {
        if (typeof f === "string") return { name: `Filter ${i + 1}`, conditions: [{ field: "value", operator: "equal to", value: f, logic: "AND" }] };
        const r = recordOf(f);
        const condsRaw = Array.isArray(r.conditions) ? r.conditions : [];
        const conditions = condsRaw.length
          ? condsRaw.map((c) => {
              const cr = recordOf(c);
              return {
                field: textValue(cr.field, "field"),
                operator: textValue(cr.operator, "equal to"),
                value: textValue(cr.value, ""),
                logic: textValue(cr.logic, "AND"),
              };
            })
          : [{ field: "value", operator: "equal to", value: textValue(r.condition, "true"), logic: "AND" }];
        return { name: textValue(r.name, `Filter ${i + 1}`), conditions };
      });

      const routersRaw = Array.isArray(item.routers) ? item.routers : fbMW.routers;
      const routers = routersRaw.map((r: unknown, i: number) => {
        if (typeof r === "string") return { path: `Path ${String.fromCharCode(65 + i)}`, condition: "—", description: r };
        const rr = recordOf(r);
        return {
          path: textValue(pick(rr, ["path", "name", "label"]), `Path ${String.fromCharCode(65 + i)}`),
          condition: textValue(pick(rr, ["condition", "filter", "rule"]), "—"),
          description: textValue(pick(rr, ["description", "purpose", "action"]), "Routing path"),
        };
      });

      const ehRaw = recordOf(pick(item, ["error_handling", "errorHandling"]));
      const error_handling = {
        retry_logic: textValue(pick(ehRaw, ["retry_logic", "retryLogic", "retry"]), fbMW.error_handling.retry_logic),
        validation_checks: listValue(pick(ehRaw, ["validation_checks", "validationChecks", "validations"]), fbMW.error_handling.validation_checks),
        exception_paths: listValue(pick(ehRaw, ["exception_paths", "exceptionPaths", "exceptions"]), fbMW.error_handling.exception_paths),
        failed_record_storage: textValue(pick(ehRaw, ["failed_record_storage", "failedRecordStorage", "failed_storage"]), fbMW.error_handling.failed_record_storage),
      };

      const logRaw = recordOf(pick(item, ["logging", "logging_strategy", "loggingStrategy"]));
      const logging = {
        execution_log: textValue(pick(logRaw, ["execution_log", "executionLog", "execution"]), fbMW.logging.execution_log),
        error_log: textValue(pick(logRaw, ["error_log", "errorLog", "errors"]), fbMW.logging.error_log),
        audit_trail: textValue(pick(logRaw, ["audit_trail", "auditTrail", "audit"]), fbMW.logging.audit_trail),
      };

      const haRaw = Array.isArray(pick(item, ["human_approval", "humanApproval", "approvals"]))
        ? (pick(item, ["human_approval", "humanApproval", "approvals"]) as unknown[])
        : fbMW.human_approval;
      const human_approval = haRaw.map((h: unknown, i: number) => {
        const r = recordOf(h);
        return {
          step: textValue(pick(r, ["step", "name", "stage"]), `Approval ${i + 1}`),
          approver: textValue(pick(r, ["approver", "owner", "role"]), "Designated approver"),
          escalation: textValue(pick(r, ["escalation", "escalation_logic", "escalationLogic"]), "Escalate to operations lead after SLA breach"),
        };
      });

      return { trigger, processing_modules, filters, routers, error_handling, logging, human_approval };
    }
    case "api_recommendations": {
      const fbApis = (fb as any).apis as any[];
      const apis = Array.isArray(item.apis) ? item.apis.map((api, index) => {
        const a = recordOf(api);
        const fbA = fbApis[index] ?? fbApis[0] ?? {};
        return {
          name: textValue(a.name, fbA.name ?? `API ${index + 1}`),
          purpose: textValue(a.purpose, fbA.purpose ?? "Support the automation"),
          why_selected: textValue(pick(a, ["why_selected", "whySelected", "why", "rationale", "reason", "justification"]), fbA.why_selected ?? ""),
          auth: textValue(pick(a, ["auth", "authentication", "auth_method", "authMethod"]), fbA.auth ?? "OAuth or API key"),
          alternatives: listValue(pick(a, ["alternatives", "alternative_apis", "alternativeApis", "alternates"]), fbA.alternatives ?? []),
          cost_estimate: textValue(pick(a, ["cost_estimate", "costEstimate", "cost"]), fbA.cost_estimate ?? "Usage-based"),
          risks: textValue(a.risks, fbA.risks ?? "Validate limits and permissions"),
          scaling: textValue(pick(a, ["scaling", "scaling_considerations", "scalingConsiderations", "scalability"]), fbA.scaling ?? "Monitor usage and add caching as needed"),
        };
      }) : fbApis;
      return { apis };
    }
    case "cost_estimate": {
      const fbC = fb as any;
      const tierOf = (raw: unknown, fbTier: any) => {
        const r = recordOf(raw);
        return {
          volume: textValue(pick(r, ["volume", "assumption", "scale"]), fbTier?.volume ?? ""),
          monthly_usd: numberValue(pick(r, ["monthly_usd", "monthlyUsd", "monthly", "cost", "amount"]), fbTier?.monthly_usd ?? 0),
        };
      };
      const liRaw = Array.isArray(pick(item, ["line_items", "lineItems", "items"]))
        ? (pick(item, ["line_items", "lineItems", "items"]) as unknown[])
        : fbC.line_items;
      const line_items = liRaw.map((row: unknown, i: number) => {
        const r = recordOf(row);
        const fbLi = fbC.line_items[i] ?? fbC.line_items[0];
        return {
          category: textValue(r.category, fbLi.category),
          component: textValue(pick(r, ["component", "item", "service", "name"]), fbLi.component),
          unit: textValue(r.unit, fbLi.unit),
          unit_cost_usd: numberValue(pick(r, ["unit_cost_usd", "unitCostUsd", "unit_cost", "rate"]), fbLi.unit_cost_usd),
          low: tierOf(r.low, fbLi.low),
          medium: tierOf(pick(r, ["medium", "mid", "baseline"]), fbLi.medium),
          high: tierOf(r.high, fbLi.high),
          note: textValue(r.note, fbLi.note),
        };
      });

      const driversRaw = Array.isArray(pick(item, ["volume_drivers", "volumeDrivers", "drivers"]))
        ? (pick(item, ["volume_drivers", "volumeDrivers", "drivers"]) as unknown[])
        : fbC.volume_drivers;
      const volume_drivers = driversRaw.map((row: unknown, i: number) => {
        const r = recordOf(row);
        const fbD = fbC.volume_drivers[i] ?? fbC.volume_drivers[0];
        return {
          driver: textValue(pick(r, ["driver", "name", "metric"]), fbD.driver),
          low: textValue(r.low, fbD.low),
          medium: textValue(pick(r, ["medium", "mid", "baseline"]), fbD.medium),
          high: textValue(r.high, fbD.high),
          unit: textValue(r.unit, fbD.unit),
        };
      });

      const totalsRaw = recordOf(item.totals);
      const sum = (t: "low" | "medium" | "high") =>
        line_items.reduce((s: number, li: any) => s + numberValue(li[t]?.monthly_usd, 0), 0);
      const tierTotal = (key: "low" | "medium" | "high") => {
        const r = recordOf((totalsRaw as any)[key]);
        const m = numberValue(pick(r, ["monthly_usd", "monthlyUsd", "monthly"]), sum(key) || fbC.totals[key].monthly_usd);
        return { monthly_usd: m, annual_usd: numberValue(pick(r, ["annual_usd", "annualUsd", "annual"]), m * 12) };
      };
      const totals = { low: tierTotal("low"), medium: tierTotal("medium"), high: tierTotal("high") };

      const breakdown = Array.isArray(item.breakdown)
        ? item.breakdown.map((row) => {
            const r = recordOf(row);
            return {
              category: textValue(r.category, "Cost item"),
              monthly_usd: numberValue(pick(r, ["monthly_usd", "monthlyUsd", "monthly"]), 0),
              note: textValue(r.note, ""),
            };
          })
        : line_items.map((li: any) => ({ category: li.category, monthly_usd: li.medium.monthly_usd, note: li.note }));

      const monthly = totals.medium.monthly_usd;
      return {
        assumptions: listValue(item.assumptions, fbC.assumptions),
        volume_drivers,
        line_items,
        totals,
        breakdown,
        monthly_total_usd: numberValue(pick(item, ["monthly_total_usd", "monthlyTotalUsd", "monthly_total"]), monthly),
        annual_total_usd: numberValue(pick(item, ["annual_total_usd", "annualTotalUsd", "annual_total"]), monthly * 12),
        growth_scenario: textValue(pick(item, ["growth_scenario", "growthScenario", "growth"]), fbC.growth_scenario),
        notes: textValue(item.notes, fbC.notes),
      };
    }
    case "readiness_score": {
      const fbR = fb as any;
      const factorsRaw = pick(item, ["factors", "scores", "dimensions"]);
      const factors = Array.isArray(factorsRaw) && factorsRaw.length > 0
        ? factorsRaw.map((f, i) => {
            const r = recordOf(f);
            const fbF = fbR.factors[i] ?? fbR.factors[0];
            return {
              name: textValue(pick(r, ["name", "factor", "label"]), fbF.name),
              score: Math.max(0, Math.min(100, numberValue(pick(r, ["score", "value", "percent"]), fbF.score))),
              weight: numberValue(r.weight, fbF.weight),
              rationale: textValue(pick(r, ["rationale", "reason", "justification", "notes"]), fbF.rationale),
              gaps: listValue(pick(r, ["gaps", "issues", "missing"]), fbF.gaps),
            };
          })
        : fbR.factors;
      const overall = numberValue(
        pick(item, ["overall_score", "overallScore", "score", "readiness", "readiness_score"]),
        Math.round(factors.reduce((s: number, f: any) => s + f.score * f.weight, 0)),
      );
      return {
        overall_score: Math.max(0, Math.min(100, Math.round(overall))),
        verdict: textValue(pick(item, ["verdict", "summary", "status"]), fbR.verdict),
        factors,
        top_gaps: listValue(pick(item, ["top_gaps", "topGaps", "gaps"]), fbR.top_gaps),
        blockers: listValue(item.blockers, fbR.blockers),
        recommended_next_steps: listValue(pick(item, ["recommended_next_steps", "next_steps", "recommendations"]), fbR.recommended_next_steps),
      };
    }
    case "consultant_recommendations": {
      const fbC = fb as any;
      const mapRisk = (arr: unknown, fbArr: any[]) => {
        const list = Array.isArray(arr) ? arr : [];
        const source = list.length ? list : fbArr;
        return source.map((x, i) => {
          const r = recordOf(x);
          const f = fbArr[i] ?? fbArr[0];
          return {
            risk: textValue(pick(r, ["risk", "name", "title"]), f.risk),
            impact: textValue(pick(r, ["impact", "severity"]), f.impact),
            likelihood: textValue(pick(r, ["likelihood", "probability"]), f.likelihood),
            mitigation: textValue(pick(r, ["mitigation", "remediation", "action"]), f.mitigation),
          };
        });
      };
      const mapImprove = (arr: unknown, fbArr: any[]) => {
        const list = Array.isArray(arr) ? arr : [];
        const source = list.length ? list : fbArr;
        return source.map((x, i) => {
          const r = recordOf(x);
          const f = fbArr[i] ?? fbArr[0];
          return {
            area: textValue(pick(r, ["area", "category", "topic"]), f.area),
            recommendation: textValue(pick(r, ["recommendation", "action", "what"]), f.recommendation),
            rationale: textValue(pick(r, ["rationale", "why", "reason"]), f.rationale),
            effort: textValue(pick(r, ["effort", "size", "tshirt"]), f.effort),
          };
        });
      };
      const mapWin = (arr: unknown, fbArr: any[]) => {
        const list = Array.isArray(arr) ? arr : [];
        const source = list.length ? list : fbArr;
        return source.map((x, i) => {
          const r = recordOf(x);
          const f = fbArr[i] ?? fbArr[0];
          return {
            win: textValue(pick(r, ["win", "name", "title", "action"]), f.win),
            value: textValue(pick(r, ["value", "benefit", "impact"]), f.value),
            effort: textValue(pick(r, ["effort", "size"]), f.effort),
          };
        });
      };
      const mapEnh = (arr: unknown, fbArr: any[]) => {
        const list = Array.isArray(arr) ? arr : [];
        const source = list.length ? list : fbArr;
        return source.map((x, i) => {
          const r = recordOf(x);
          const f = fbArr[i] ?? fbArr[0];
          return {
            enhancement: textValue(pick(r, ["enhancement", "name", "title", "feature"]), f.enhancement),
            value: textValue(pick(r, ["value", "benefit", "impact"]), f.value),
            when: textValue(pick(r, ["when", "timing", "horizon"]), f.when),
          };
        });
      };
      const mapDebt = (arr: unknown, fbArr: any[]) => {
        const list = Array.isArray(arr) ? arr : [];
        const source = list.length ? list : fbArr;
        return source.map((x, i) => {
          const r = recordOf(x);
          const f = fbArr[i] ?? fbArr[0];
          return {
            debt: textValue(pick(r, ["debt", "item", "name", "title"]), f.debt),
            consequence: textValue(pick(r, ["consequence", "impact", "risk"]), f.consequence),
            remediation: textValue(pick(r, ["remediation", "mitigation", "action", "fix"]), f.remediation),
          };
        });
      };
      return {
        executive_summary: textValue(pick(item, ["executive_summary", "summary", "overview"]), fbC.executive_summary),
        key_risks: mapRisk(pick(item, ["key_risks", "risks"]), fbC.key_risks),
        recommended_improvements: mapImprove(pick(item, ["recommended_improvements", "improvements", "recommendations"]), fbC.recommended_improvements),
        quick_wins: mapWin(pick(item, ["quick_wins", "quickWins", "wins"]), fbC.quick_wins),
        future_enhancements: mapEnh(pick(item, ["future_enhancements", "futureEnhancements", "enhancements", "roadmap_items"]), fbC.future_enhancements),
        technical_debt_risks: mapDebt(pick(item, ["technical_debt_risks", "technical_debt", "tech_debt", "debt"]), fbC.technical_debt_risks),
        closing_note: textValue(pick(item, ["closing_note", "closing", "conclusion"]), fbC.closing_note),
      };
    }
    case "make_blueprint": {
      const fbB = fb as any;
      const mapList = <T,>(raw: unknown, fbList: T[], mapper: (r: Record<string, unknown>, i: number, f: T) => T): T[] => {
        const arr = Array.isArray(raw) ? raw : [];
        const source = arr.length ? arr : fbList;
        return source.map((x, i) => mapper(recordOf(x), i, (fbList[i] ?? fbList[0]) as T));
      };
      const module_sequence = mapList(pick(item, ["module_sequence", "modules", "sequence", "steps"]), fbB.module_sequence, (r, i, f: any) => ({
        number: numberValue(pick(r, ["number", "step", "order"]), i + 1),
        type: textValue(pick(r, ["type", "kind", "category"]), f.type),
        name: textValue(pick(r, ["name", "title"]), f.name),
        app: textValue(pick(r, ["app", "module", "service"]), f.app),
        purpose: textValue(pick(r, ["purpose", "description", "what"]), f.purpose),
        notes: textValue(pick(r, ["notes", "note", "detail"]), f.notes),
      }));
      const filters = mapList(item.filters, fbB.filters, (r, i, f: any) => ({
        name: textValue(pick(r, ["name", "title"]), f.name),
        after_module: numberValue(pick(r, ["after_module", "afterModule", "after"]), f.after_module),
        conditions: (Array.isArray(r.conditions) ? r.conditions : f.conditions).map((c: any, ci: number) => {
          const cr = recordOf(c);
          const ff = f.conditions[ci] ?? f.conditions[0];
          return {
            field: textValue(cr.field, ff.field),
            operator: textValue(cr.operator, ff.operator),
            value: textValue(cr.value, ff.value),
          };
        }),
      }));
      const routers = mapList(item.routers, fbB.routers, (r, i, f: any) => ({
        name: textValue(pick(r, ["name", "title"]), f.name),
        after_module: numberValue(pick(r, ["after_module", "afterModule", "after"]), f.after_module),
        branches: (Array.isArray(r.branches) ? r.branches : f.branches).map((b: any, bi: number) => {
          const br = recordOf(b);
          const fb2 = f.branches[bi] ?? f.branches[0];
          return {
            label: textValue(pick(br, ["label", "name", "path"]), fb2.label),
            condition: textValue(pick(br, ["condition", "rule", "filter"]), fb2.condition),
            modules: listValue(pick(br, ["modules", "actions", "steps"]), fb2.modules),
            outcome: textValue(pick(br, ["outcome", "result", "description"]), fb2.outcome),
          };
        }),
      }));
      const error_handlers = mapList(pick(item, ["error_handlers", "errorHandlers", "errors"]), fbB.error_handlers, (r, i, f: any) => ({
        module: textValue(pick(r, ["module", "target", "step"]), f.module),
        strategy: textValue(pick(r, ["strategy", "behavior", "type"]), f.strategy),
        fallback: textValue(pick(r, ["fallback", "fallback_action", "on_failure"]), f.fallback),
      }));
      const data_stores = mapList(pick(item, ["data_stores", "dataStores", "stores"]), fbB.data_stores, (r, i, f: any) => ({
        name: textValue(pick(r, ["name", "title"]), f.name),
        purpose: textValue(pick(r, ["purpose", "description"]), f.purpose),
        fields: (Array.isArray(r.fields) ? r.fields : f.fields).map((fl: any, fi: number) => {
          const fr = recordOf(fl);
          const ff = f.fields[fi] ?? f.fields[0];
          return { name: textValue(fr.name, ff.name), type: textValue(fr.type, ff.type) };
        }),
      }));
      const human_approval_steps = mapList(pick(item, ["human_approval_steps", "humanApprovalSteps", "approvals", "human_approval"]), fbB.human_approval_steps, (r, i, f: any) => ({
        step: textValue(pick(r, ["step", "name", "title"]), f.step),
        approver: textValue(pick(r, ["approver", "role", "owner"]), f.approver),
        channel: textValue(pick(r, ["channel", "medium", "via"]), f.channel),
        sla: textValue(pick(r, ["sla", "deadline", "timeout"]), f.sla),
        escalation: textValue(pick(r, ["escalation", "escalation_path", "on_breach"]), f.escalation),
      }));
      return {
        scenario_name: textValue(pick(item, ["scenario_name", "scenarioName", "name", "title"]), fbB.scenario_name),
        description: textValue(pick(item, ["description", "summary", "overview"]), fbB.description),
        module_sequence,
        filters,
        routers,
        error_handlers,
        data_stores,
        human_approval_steps,
        tree_diagram: textValue(pick(item, ["tree_diagram", "treeDiagram", "tree", "ascii", "diagram"]), fbB.tree_diagram),
      };
    }
    case "roadmap":
      return { phases: Array.isArray(item.phases) ? item.phases.map((phase, index) => { const p = recordOf(phase); return { name: textValue(p.name, `Phase ${index + 1}`), duration: textValue(p.duration, "1-2 weeks"), deliverables: listValue(p.deliverables, ["Working deliverable"]), milestones: listValue(p.milestones, ["Approval checkpoint"]) }; }) : fb.phases, dependencies: listValue(item.dependencies, fb.dependencies), risks: listValue(item.risks, fb.risks) };
    case "proposal":
      return { overview: textValue(item.overview, fb.overview), scope: listValue(item.scope, fb.scope), deliverables: listValue(item.deliverables, fb.deliverables), timeline: textValue(item.timeline, fb.timeline), assumptions: listValue(item.assumptions, fb.assumptions), success_metrics: listValue(pick(item, ["success_metrics", "successMetrics", "metrics"]), fb.success_metrics) };
  }
}

const PROMPTS: Record<(typeof DELIVERABLE_KINDS)[number], string> = {
  business_analysis: "As a Business Analyst, produce a structured business analysis.",
  architecture: `As a Solution Architect, design an implementation-ready system architecture. Explain WHY each component exists, not just what it is. Return JSON with this exact shape:
{
  "components": [{ "name": "", "responsibility": "what it does", "why": "why this component must exist in the system", "technology": "specific tool" }],
  "data_flow": "end-to-end flow as one paragraph using arrows",
  "integration_points": [{ "system": "", "direction": "Inbound|Outbound|Bidirectional", "method": "Webhook|REST|GraphQL|Event|SQL", "auth": "", "notes": "" }],
  "authentication": [{ "actor": "who/what is authenticating", "method": "" }],
  "data_storage": { "primary": "what + why this store", "secondary": "what + why", "retention": "", "pii_handling": "" },
  "failure_points": [{ "point": "", "impact": "", "mitigation": "" }],
  "recovery_strategy": "how the system recovers from failures (idempotency, replay, reconciliation)",
  "scalability": ["specific bottleneck + scaling action"],
  "security": ["specific control"],
  "systems": ["stack"],
  "integrations": ["external systems"],
  "mermaid": "flowchart TD ... (no backticks, valid mermaid)"
}
Every component MUST include a non-empty "why". Be specific to the project domain, not generic.`,
  ai_agents: `As an AI Architect, design the specialized AI agents needed (2-4 agents). Return JSON with this exact shape:
{
  "agents": [{
    "name": "specific agent name",
    "purpose": "1 sentence",
    "trigger": "what invokes this agent",
    "inputs": ["concrete inputs"],
    "outputs": ["concrete outputs"],
    "prompt_strategy": "few-shot / chain-of-thought / extraction / etc, with temperature, output format, grounding",
    "decision_logic": ["explicit if/then rule", "..."],
    "failure_handling": "retry + fallback behavior",
    "human_escalation": "when to escalate, to whom, SLA",
    "example_prompt": "an actual prompt template using <<placeholders>>"
  }]
}
Be implementation-ready and specific to the project domain. Every field is required.`,
  make_workflow: `As a Make.com Automation Architect, design an implementation-ready scenario (not a high-level summary). Return JSON with this exact shape:
{
  "trigger": { "module_name": "", "module_type": "e.g. Webhooks > Custom webhook", "configuration": "", "input_data": [{"field":"","type":"string|number|boolean|date|collection","required":true}] },
  "processing_modules": [{ "number": 1, "name": "", "app": "specific Make.com app (e.g. OpenAI > Create a completion, Postgres > Insert a row, Slack > Create a message)", "purpose": "", "input_mapping": [{"field":"","source":"{{1.field}}"}], "output_mapping": [{"field":"","destination":"scenario variable | downstream module"}] }],
  "filters": [{ "name": "", "conditions": [{"field":"","operator":"equal to|greater than|less than|contains|exists","value":"","logic":"AND|OR"}] }],
  "routers": [{ "path": "Path A — ...", "condition": "explicit boolean expression", "description": "" }],
  "error_handling": { "retry_logic": "specific Make.com error handler with backoff", "validation_checks": [""], "exception_paths": [""], "failed_record_storage": "where failed payloads go" },
  "logging": { "execution_log": "", "error_log": "", "audit_trail": "" },
  "human_approval": [{ "step": "", "approver": "role / person", "escalation": "SLA + escalation path" }]
}
Use concrete Make.com app names, real operators, and explicit field-level mappings. At least 4 processing modules, 1 filter, 2-3 router paths.`,
  api_recommendations: `As an Integration Architect, recommend the specific APIs required to implement the selected strategy. Return JSON: { "apis": [{ "name": "vendor + product", "purpose": "what it does in this workflow", "why_selected": "concrete reason tied to the requirements and selected stack", "auth": "specific auth method (OAuth 2.0 scopes / API key / HMAC webhook)", "alternatives": ["2-3 realistic competing APIs"], "cost_estimate": "tier or $/month with assumptions on volume", "risks": "rate limits, deprecation, data residency, scope drift", "scaling": "how to scale safely (batching, caching, queues, webhooks vs polling)" }] }. Recommend 4-7 APIs. No generic filler. Tie every recommendation to the chosen architecture.`,
  cost_estimate: `As an FP&A consultant, build a realistic, volume-based cost estimate for this automation. Use current list prices in USD. Return JSON:
{
  "assumptions": ["explicit assumptions including pricing source, token split, ops definition, seat counts"],
  "volume_drivers": [{ "driver": "trigger events / mo | AI calls per record | Make ops per record | CRM writes per record", "low": "", "medium": "", "high": "", "unit": "" }],
  "line_items": [
    { "category": "AI processing (OpenAI)", "component": "specific model + use", "unit": "per 1K tokens", "unit_cost_usd": 0, "low": {"volume":"","monthly_usd":0}, "medium": {"volume":"","monthly_usd":0}, "high": {"volume":"","monthly_usd":0}, "note": "" },
    { "category": "Automation (Make.com)", "component": "plan + ops type", "unit": "per operation", "unit_cost_usd": 0, "low": {...}, "medium": {...}, "high": {...}, "note": "" },
    { "category": "CRM", "component": "vendor + tier + seats", "unit": "per seat / mo", "unit_cost_usd": 0, "low": {...}, "medium": {...}, "high": {...}, "note": "" },
    { "category": "Hosting & database", "component": "app + DB + storage", "unit": "per month", "unit_cost_usd": 0, "low": {...}, "medium": {...}, "high": {...}, "note": "" },
    { "category": "Monitoring & buffer", "component": "logs + alerts + margin", "unit": "per month", "unit_cost_usd": 0, "low": {...}, "medium": {...}, "high": {...}, "note": "" }
  ],
  "totals": { "low": {"monthly_usd":0,"annual_usd":0}, "medium": {"monthly_usd":0,"annual_usd":0}, "high": {"monthly_usd":0,"annual_usd":0} },
  "growth_scenario": "describe what happens to costs at ~2x baseline volume in 12 months, noting which lines scale linearly vs step-up",
  "notes": "what to refresh before signing"
}
Every line item MUST have low/medium/high monthly_usd that sum to the totals. Numbers must be realistic for the named vendor and tier.`,
  readiness_score: `As an Implementation Readiness Assessor, score how ready this automation is to build. Return JSON:
{
  "overall_score": 0-100,
  "verdict": "Ready to build | Ready with gaps to close | Not ready — close gaps first",
  "factors": [
    { "name": "Requirement Completeness", "score": 0-100, "weight": 0.22, "rationale": "specific to this project", "gaps": ["concrete missing item"] },
    { "name": "Integration Availability", "score": 0-100, "weight": 0.20, "rationale": "", "gaps": [] },
    { "name": "Data Quality", "score": 0-100, "weight": 0.20, "rationale": "", "gaps": [] },
    { "name": "Human Approval Logic", "score": 0-100, "weight": 0.18, "rationale": "", "gaps": [] },
    { "name": "Error Handling Coverage", "score": 0-100, "weight": 0.20, "rationale": "", "gaps": [] }
  ],
  "top_gaps": ["the 3-5 highest-impact gaps across factors"],
  "blockers": ["hard blockers that must be resolved before build"],
  "recommended_next_steps": ["concrete actions with owners where possible"]
}
Weights must sum to ~1.0. overall_score should approximate the weighted average of factor scores. Be specific to the project domain, not generic.`,
  consultant_recommendations: `As a Senior Automation Consultant, write a recommendations memo that sounds like a real consultant — direct, prioritized, and grounded in this project's specifics. Return JSON:
{
  "executive_summary": "2-3 sentences naming the biggest themes from discovery and the headline recommendation",
  "key_risks": [{ "risk": "specific risk to this project", "impact": "High|Medium|Low", "likelihood": "High|Medium|Low", "mitigation": "concrete mitigation action" }],
  "recommended_improvements": [{ "area": "Data quality|Observability|Approval workflow|Security|Performance|...", "recommendation": "what to do", "rationale": "why now", "effort": "S|M|L" }],
  "quick_wins": [{ "win": "action implementable in <1 week", "value": "concrete benefit", "effort": "S|M" }],
  "future_enhancements": [{ "enhancement": "post-launch idea", "value": "concrete benefit", "when": "trigger or timing for revisiting" }],
  "technical_debt_risks": [{ "debt": "specific debt being taken on", "consequence": "what breaks later", "remediation": "how to pay it down" }],
  "closing_note": "1-2 sentence prioritization guidance"
}
Provide 3-5 items per array. No generic filler — every item must reference the project's domain, stack, requirements, or selected strategy.`,
  make_blueprint: `As a Make.com Solution Architect, produce a direct-to-build scenario blueprint that another engineer could open Make.com and rebuild without asking questions. Return JSON with this exact shape:
{
  "scenario_name": "",
  "description": "1-2 sentence summary of what the scenario does end-to-end",
  "module_sequence": [{ "number": 1, "type": "trigger|action|filter|router|data_store|approval|error_handler", "name": "", "app": "specific Make.com app (e.g. Webhooks > Custom webhook, OpenAI > Create a completion, Postgres > Insert a row, HubSpot > Create a deal, Data Stores > Add a record)", "purpose": "what the module does in this scenario", "notes": "config detail, gotcha, or dependency" }],
  "filters": [{ "name": "", "after_module": 0, "conditions": [{ "field": "", "operator": "equal to|not equal to|greater than|less than|contains|exists", "value": "" }] }],
  "routers": [{ "name": "", "after_module": 0, "branches": [{ "label": "High Score|Medium Score|Low Score|...", "condition": "explicit boolean expression", "modules": ["downstream module names"], "outcome": "" }] }],
  "error_handlers": [{ "module": "which module this handler attaches to", "strategy": "Make.com directive (Break + retries + backoff | Resume with default | Ignore | Rollback | Commit)", "fallback": "what happens to the record on unrecoverable failure" }],
  "data_stores": [{ "name": "", "purpose": "", "fields": [{ "name": "", "type": "string|number|boolean|date|collection" }] }],
  "human_approval_steps": [{ "step": "", "approver": "role / person", "channel": "Slack action buttons|Email|HubSpot task|...", "sla": "", "escalation": "" }],
  "tree_diagram": "ASCII tree using ↓ between sequential steps and ├─ / └─ for router branches. Use literal newlines (\\n). MUST visually match the actual scenario flow above."
}
At least 6 modules in module_sequence, 2 filters, 1 router with 2-4 branches, 2 error_handlers, 1-3 data_stores, and 1+ human_approval_steps. Be specific to the project domain and selected stack — no generic placeholders. tree_diagram MUST be implementation-ready and readable in a fixed-width font.`,
  roadmap: "As an Implementation Lead, produce a phased delivery roadmap.",
  proposal: "As a Senior Consultant, produce a client-facing proposal.",
};

export const generateDeliverable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ projectId: z.string().uuid(), kind: z.enum(DELIVERABLE_KINDS) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: project } = await context.supabase
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .single();
    if (!project) throw new Error("Project not found");

    const { data: strategies } = await context.supabase
      .from("strategies")
      .select("*")
      .eq("project_id", data.projectId);

    const selected = strategies?.find((s) => s.tier === project.selected_strategy);

    const fallback = fallbackDeliverable(data.kind, project, selected?.data);
    const object = await generateJson(
      z.unknown().transform((raw) => normalizeDeliverable(data.kind, raw, fallback)),
      `${PROMPTS[data.kind]}\n\nProject: ${project.name}\nDomain: ${project.domain}\nRequirements: ${JSON.stringify(project.requirements)}\nSelected strategy (${project.selected_strategy}): ${JSON.stringify(selected?.data)}\n\nProduce the deliverable as JSON.`,
    ).catch((error) => {
      console.error("AI deliverable generation failed", error);
      return fallback;
    });

    const result = object as Record<string, unknown>;
    await context.supabase
      .from("deliverables")
      .upsert({
        project_id: data.projectId,
        user_id: context.userId,
        kind: data.kind,
        data: result as never,
      }, { onConflict: "project_id,kind" });

    return result as any;
  });
