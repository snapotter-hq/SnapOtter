import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const jobStatus = pgEnum("job_status", ["queued", "processing", "completed", "failed"]);

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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  analyticsEnabled: boolean("analytics_enabled"),
  analyticsConsentShownAt: timestamp("analytics_consent_shown_at", { withTimezone: true }),
  analyticsConsentRemindAt: timestamp("analytics_consent_remind_at", { withTimezone: true }),
});

export const teams = pgTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
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

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  status: jobStatus("status").notNull().default("queued"),
  progress: real("progress").notNull().default(0),
  inputFiles: jsonb("input_files").$type<{ totalFiles: number } | unknown[]>().notNull(),
  outputPath: text("output_path"),
  settings: jsonb("settings").$type<Record<string, unknown>>(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const apiKeys = pgTable("api_keys", {
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
});

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

export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
  actorUsername: text("actor_username").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  details: jsonb("details").$type<Record<string, unknown>>(),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const roles = pgTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  permissions: jsonb("permissions").$type<string[]>().notNull(),
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
