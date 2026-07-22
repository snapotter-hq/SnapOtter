import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const jobStatus = pgEnum("job_status", [
  "queued",
  "processing",
  "completed",
  "failed",
  "canceled",
]);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("user"),
  team: text("team").notNull().default("Default"),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  authProvider: text("auth_provider").notNull().default("local"),
  externalId: text("external_id"),
  email: text("email"),
  legalHold: boolean("legal_hold").notNull().default(false),
  storageUsed: bigint("storage_used", { mode: "number" }).notNull().default(0),
  storageQuota: bigint("storage_quota", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  recoveryCodesHash: text("recovery_codes_hash"),
});

export const teams = pgTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  legalHold: boolean("legal_hold").notNull().default(false),
  storageQuota: bigint("storage_quota", { mode: "number" }),
  retentionHours: integer("retention_hours"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  idToken: text("id_token"),
  lastActivity: timestamp("last_activity", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    toolId: text("tool_id"),
    pool: text("pool"),
    type: text("type").notNull(),
    status: jobStatus("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    progress: jsonb("progress").$type<{
      percent: number;
      stage?: string;
      result?: Record<string, unknown>;
    }>(),
    inputRefs: jsonb("input_refs").$type<string[]>(),
    outputRefs: jsonb("output_refs").$type<string[]>(),
    settings: jsonb("settings").$type<Record<string, unknown>>(),
    error: jsonb("error").$type<{ message: string; details?: unknown }>(),
    bytesIn: bigint("bytes_in", { mode: "number" }),
    bytesOut: bigint("bytes_out", { mode: "number" }),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    deleteAfter: timestamp("delete_after", { withTimezone: true }),
  },
  (table) => [
    index("jobs_created_at_idx").on(table.createdAt),
    index("jobs_status_idx").on(table.status),
  ],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    keyHash: text("key_hash").notNull(),
    keyPrefix: text("key_prefix"),
    name: text("name").notNull().default("Default API Key"),
    permissions: jsonb("permissions").$type<string[]>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  // Prefix lookup runs on every API-key auth; without this index it is a full
  // table scan. The prefix is a SHA-256 slice (not unique by construction), so
  // a non-unique index is correct.
  (table) => [index("api_keys_key_prefix_idx").on(table.keyPrefix)],
);

export const pipelines = pgTable("pipelines", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  steps: jsonb("steps").$type<{ toolId: string; settings: Record<string, unknown> }[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorUsername: text("actor_username").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    integrity: text("integrity"),
    requestId: text("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("audit_log_created_at_idx").on(table.createdAt),
    index("audit_log_action_idx").on(table.action),
    index("audit_log_actor_id_idx").on(table.actorId),
  ],
);

export const roles = pgTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  permissions: jsonb("permissions").$type<string[]>().notNull(),
  toolPermissions: jsonb("tool_permissions").$type<{ mode: string; allowed: string[] } | null>(),
  isBuiltin: boolean("is_builtin").notNull().default(false),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const userFiles = pgTable("user_files", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  originalName: text("original_name").notNull(),
  storedName: text("stored_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  width: integer("width"),
  height: integer("height"),
  version: integer("version").notNull().default(1),
  parentId: text("parent_id"),
  toolChain: jsonb("tool_chain").$type<string[]>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.userId, table.key] })],
);
