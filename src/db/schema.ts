import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ───────────── Enums ("roles" and fixed lists live here) ───────────── */
export const userRole = pgEnum("user_role", ["ADMIN", "USER"]); // platform level: Administrator / Standard User
export const memberRole = pgEnum("member_role", ["ADMIN", "MEMBER"]); // inside one workspace
export const leadStatus = pgEnum("lead_status", [
  "NEW",
  "RESEARCHING",
  "QUALIFIED",
  "CONTACTED",
  "FOLLOW_UP_REQUIRED",
  "MEETING_SCHEDULED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "CONVERTED",
  "NOT_INTERESTED",
  "DISQUALIFIED",
]);
export const verificationStatus = pgEnum("verification_status", [
  "VERIFIED",
  "PARTIALLY_VERIFIED",
  "UNVERIFIED",
  "OUTDATED",
]);
export const taskPriority = pgEnum("task_priority", ["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const taskKind = pgEnum("task_kind", ["TASK", "FOLLOW_UP", "MEETING"]);
export const campaignStatus = pgEnum("campaign_status", ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"]);
export const emailStatus = pgEnum("email_status", ["DRAFT", "APPROVED", "SENT", "FAILED", "REJECTED"]);
export const kraPeriod = pgEnum("kra_period", ["MONTHLY", "QUARTERLY"]);

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());

/* ───────────── users, workspaces, membership ───────────── */
export const users = pgTable(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").default("USER").notNull(),
    jobTitle: text("job_title"),
    industry: text("industry"),
    country: text("country"),
    image: text("image"),
    isActive: boolean("is_active").default(true).notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    sessionVersion: integer("session_version").default(1).notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_unique").on(sql`lower(${t.email})`)]
);

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  companyName: text("company_name"),
  industry: text("industry"),
  timezone: text("timezone").default("Asia/Kolkata").notNull(),
  dateFormat: text("date_format").default("dd MMM yyyy").notNull(),
  // scoring configuration, ideal customer profile, preferences (see src/lib/workspace-settings.ts)
  settings: jsonb("settings").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: id(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    role: memberRole("role").default("MEMBER").notNull(),
    department: text("department"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("workspace_members_unique").on(t.workspaceId, t.userId),
    index("workspace_members_user_idx").on(t.userId),
  ]
);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    type: text("type").notNull(), // VERIFY_EMAIL | RESET_PASSWORD
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("auth_tokens_hash_unique").on(t.tokenHash), index("auth_tokens_user_idx").on(t.userId)]
);

/* ───────────── companies, leads and everything attached to leads ───────────── */
export const companies = pgTable(
  "companies",
  {
    id: id(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    website: text("website"),
    domain: text("domain"),
    industry: text("industry"),
    size: text("size"),
    location: text("location"),
    country: text("country"),
    businessType: text("business_type"),
    revenueRange: text("revenue_range"),
    fundingStage: text("funding_stage"),
    linkedinUrl: text("linkedin_url"),
    source: text("source"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("companies_ws_name_idx").on(t.workspaceId, sql`lower(${t.name})`),
    index("companies_ws_domain_idx").on(t.workspaceId, t.domain),
  ]
);

export const leadSources = pgTable(
  "lead_sources",
  {
    id: id(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(), // MANUAL | CSV_IMPORT | PROVIDER | OTHER
    details: jsonb("details").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("lead_sources_ws_idx").on(t.workspaceId)]
);

export const leads = pgTable(
  "leads",
  {
    id: id(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    sourceId: uuid("source_id").references(() => leadSources.id, { onDelete: "set null" }),
    firstName: text("first_name"),
    lastName: text("last_name"),
    fullName: text("full_name").notNull(),
    jobTitle: text("job_title"),
    seniority: text("seniority"),
    department: text("department"),
    email: text("email"),
    phone: text("phone"),
    linkedinUrl: text("linkedin_url"),
    location: text("location"),
    country: text("country"),
    companyName: text("company_name"),
    companyWebsite: text("company_website"),
    industry: text("industry"),
    companySize: text("company_size"),
    interests: text("interests"), // e.g. "basmati rice, turmeric" — what this buyer imports
    status: leadStatus("status").default("NEW").notNull(),
    score: integer("score"),
    scoreCategory: text("score_category"),
    verification: verificationStatus("verification").default("UNVERIFIED").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    // per-field enrichment trail: { fieldName: { source, verifiedAt } }
    fieldSources: jsonb("field_sources").$type<Record<string, { source: string; verifiedAt: string }>>().default({}).notNull(),
    sourceLabel: text("source_label"), // original source text, kept on every record
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    dealValue: numeric("deal_value", { precision: 14, scale: 2 }),
    dealCurrency: text("deal_currency").default("USD"),
    stageEnteredAt: timestamp("stage_entered_at", { withTimezone: true }).defaultNow().notNull(),
    qualifiedAt: timestamp("qualified_at", { withTimezone: true }),
    firstContactedAt: timestamp("first_contacted_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).defaultNow().notNull(),
    nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
    emailOptOut: boolean("email_opt_out").default(false).notNull(),
    isDemo: boolean("is_demo").default(false).notNull(),
    // "Discovered" leads (found or imported) wait outside the CRM until someone adds them. Only CRM leads count in metrics.
    inCrm: boolean("in_crm").default(true).notNull(),
    crmAddedAt: timestamp("crm_added_at", { withTimezone: true }).defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("leads_ws_status_idx").on(t.workspaceId, t.status),
    index("leads_ws_score_idx").on(t.workspaceId, t.score),
    index("leads_ws_created_idx").on(t.workspaceId, t.createdAt),
    index("leads_ws_email_idx").on(t.workspaceId, sql`lower(${t.email})`),
    index("leads_ws_linkedin_idx").on(t.workspaceId, sql`lower(${t.linkedinUrl})`),
    index("leads_ws_name_company_idx").on(t.workspaceId, sql`lower(${t.fullName})`, sql`lower(${t.companyName})`),
    index("leads_assigned_idx").on(t.assignedTo),
    index("leads_ws_crm_idx").on(t.workspaceId, t.inCrm, t.crmAddedAt),
  ]
);

export const leadScores = pgTable(
  "lead_scores",
  {
    id: id(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }).notNull(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),
    score: integer("score").notNull(),
    category: text("category").notNull(),
    breakdown: jsonb("breakdown").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("lead_scores_lead_idx").on(t.leadId, t.createdAt)]
);

export const leadNotes = pgTable(
  "lead_notes",
  {
    id: id(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }).notNull(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("lead_notes_lead_idx").on(t.leadId, t.createdAt)]
);

export const leadActivities = pgTable(
  "lead_activities",
  {
    id: id(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }).notNull(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type").notNull(), // CREATED | STATUS_CHANGE | NOTE | SCORE | ENRICHED | EMAIL | TASK | ASSIGNED | UPDATED
    summary: text("summary").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("lead_activities_lead_idx").on(t.leadId, t.createdAt), index("lead_activities_ws_idx").on(t.workspaceId, t.createdAt)]
);

export const leadLists = pgTable(
  "lead_lists",
  {
    id: id(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("lead_lists_ws_idx").on(t.workspaceId)]
);

export const leadListItems = pgTable(
  "lead_list_items",
  {
    listId: uuid("list_id").references(() => leadLists.id, { onDelete: "cascade" }).notNull(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }).notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.listId, t.leadId] })]
);

export const savedSearches = pgTable(
  "saved_searches",
  {
    id: id(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    filters: jsonb("filters").$type<Record<string, string>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("saved_searches_ws_idx").on(t.workspaceId)]
);

/** Stage history — one row per time a lead sits in a pipeline status. Powers stage duration and conversion analytics. */
export const salesPipeline = pgTable(
  "sales_pipeline",
  {
    id: id(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }).notNull(),
    fromStatus: leadStatus("from_status"),
    toStatus: leadStatus("to_status").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    enteredAt: timestamp("entered_at", { withTimezone: true }).defaultNow().notNull(),
    exitedAt: timestamp("exited_at", { withTimezone: true }),
  },
  (t) => [index("sales_pipeline_lead_idx").on(t.leadId, t.enteredAt), index("sales_pipeline_ws_idx").on(t.workspaceId, t.toStatus)]
);

/* ───────────── tasks, campaigns, email outreach ───────────── */
export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    kind: taskKind("kind").default("TASK").notNull(),
    priority: taskPriority("priority").default("MEDIUM").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tasks_ws_due_idx").on(t.workspaceId, t.dueAt),
    index("tasks_assigned_idx").on(t.assignedTo, t.completedAt),
    index("tasks_lead_idx").on(t.leadId),
  ]
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: id(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    targetIndustry: text("target_industry"),
    targetLocation: text("target_location"),
    targetTitles: text("target_titles"),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    status: campaignStatus("status").default("DRAFT").notNull(),
    listId: uuid("list_id").references(() => leadLists.id, { onDelete: "set null" }),
    subjectTemplate: text("subject_template"),
    bodyTemplate: text("body_template"),
    assignedTeam: jsonb("assigned_team").$type<string[]>().default([]).notNull(),
    dailySendLimit: integer("daily_send_limit").default(20).notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("campaigns_ws_idx").on(t.workspaceId, t.status)]
);

export const campaignLeads = pgTable(
  "campaign_leads",
  {
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }).notNull(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }).notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.leadId] })]
);

/** Every outgoing email is a row here. Nothing is sent until status = APPROVED by a human. */
export const outreachEmails = pgTable(
  "outreach_emails",
  {
    id: id(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }).notNull(),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: emailStatus("status").default("DRAFT").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    messageId: text("message_id"),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("outreach_ws_status_idx").on(t.workspaceId, t.status), index("outreach_lead_idx").on(t.leadId)]
);

export const emailSuppressions = pgTable(
  "email_suppressions",
  {
    id: id(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),
    email: text("email").notNull(),
    reason: text("reason").default("UNSUBSCRIBED").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("email_suppressions_unique").on(t.workspaceId, sql`lower(${t.email})`)]
);

/* ───────────── KRA / KPI / performance ───────────── */
export const kras = pgTable(
  "kras",
  {
    id: id(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "cascade" }).notNull(),
    department: text("department"),
    measurement: text("measurement"), // free-text measurement criteria
    metricKey: text("metric_key"), // which KPI metric is used to compute actual achievement automatically
    target: numeric("target", { precision: 14, scale: 2 }).notNull(),
    period: kraPeriod("period").default("MONTHLY").notNull(),
    weightage: integer("weightage").default(10).notNull(),
    manualActual: numeric("manual_actual", { precision: 14, scale: 2 }), // optional override for non-measurable KRAs
    reviewNotes: text("review_notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("kras_ws_user_idx").on(t.workspaceId, t.assignedTo)]
);

export const kpiDefinitions = pgTable(
  "kpi_definitions",
  {
    id: id(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    unit: text("unit").default("count").notNull(),
    higherIsBetter: boolean("higher_is_better").default(true).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("kpi_definitions_unique").on(t.workspaceId, t.key)]
);

export const kpiTargets = pgTable(
  "kpi_targets",
  {
    id: id(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),
    kpiKey: text("kpi_key").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }), // null = team target
    period: text("period").default("MONTHLY").notNull(),
    target: numeric("target", { precision: 14, scale: 2 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("kpi_targets_unique").on(t.workspaceId, t.kpiKey, sql`coalesce(${t.userId}, '00000000-0000-0000-0000-000000000000'::uuid)`, t.period)]
);

export const employeePerformance = pgTable(
  "employee_performance",
  {
    id: id(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    metrics: jsonb("metrics").$type<Record<string, number>>().notNull(),
    kpiAchievement: numeric("kpi_achievement", { precision: 7, scale: 2 }),
    kraAchievement: numeric("kra_achievement", { precision: 7, scale: 2 }),
    createdAt: createdAt(),
  },
  (t) => [index("employee_performance_idx").on(t.workspaceId, t.userId, t.periodStart)]
);

/* ───────────── notifications, integrations, logs ───────────── */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.createdAt),
    uniqueIndex("notifications_dedupe_unique").on(t.userId, t.dedupeKey),
  ]
);

export const integrations = pgTable(
  "integrations",
  {
    id: id(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),
    provider: text("provider").notNull(), // HUNTER | ANTHROPIC | SMTP | LINKEDIN
    status: text("status").default("NOT_CONFIGURED").notNull(),
    config: jsonb("config").$type<Record<string, string>>().default({}).notNull(), // non-secret settings only
    secretEnc: text("secret_enc"), // AES-256-GCM encrypted secret (API key / SMTP password)
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("integrations_unique").on(t.workspaceId, t.provider)]
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_ws_idx").on(t.workspaceId, t.createdAt), index("audit_logs_user_idx").on(t.userId, t.createdAt)]
);

export const errorLogs = pgTable(
  "error_logs",
  {
    id: id(),
    message: text("message").notNull(),
    stack: text("stack"),
    path: text("path"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("error_logs_created_idx").on(t.createdAt)]
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").default(0).notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Kra = typeof kras.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type OutreachEmail = typeof outreachEmails.$inferSelect;
