import packageJson from "../../../package.json";

const DEMO_APP_VERSION = packageJson.version;

const PERMISSIONS = [
  "tools:use",
  "files:own",
  "files:all",
  "apikeys:own",
  "apikeys:all",
  "pipelines:own",
  "pipelines:all",
  "settings:read",
  "settings:write",
  "users:manage",
  "teams:manage",
  "features:manage",
  "system:health",
  "audit:read",
];

const FEATURE_BUNDLES = [
  {
    id: "background-removal",
    name: "Background Removal",
    description: "Remove image backgrounds with AI",
    status: "installed",
    installedVersion: "1.0.0",
    estimatedSize: "4-5 GB",
    enablesTools: ["remove-background", "passport-photo", "transparency-fixer"],
    progress: null,
    error: null,
  },
  {
    id: "face-detection",
    name: "Face Detection",
    description: "Detect and blur faces, fix red-eye, smart crop",
    status: "installed",
    installedVersion: "1.0.0",
    estimatedSize: "200-300 MB",
    enablesTools: ["blur-faces", "red-eye-removal", "smart-crop"],
    progress: null,
    error: null,
  },
  {
    id: "object-eraser-colorize",
    name: "Object Eraser & Colorize",
    description: "Erase objects from photos and colorize B&W images",
    status: "installed",
    installedVersion: "1.0.0",
    estimatedSize: "1-2 GB",
    enablesTools: ["erase-object", "colorize", "ai-canvas-expand"],
    progress: null,
    error: null,
  },
  {
    id: "upscale-enhance",
    name: "Upscale & Enhance",
    description: "AI upscaling, face enhancement, and noise removal",
    status: "installed",
    installedVersion: "1.0.0",
    estimatedSize: "4-5 GB",
    enablesTools: ["upscale", "enhance-faces", "noise-removal"],
    progress: null,
    error: null,
  },
  {
    id: "photo-restoration",
    name: "Photo Restoration",
    description: "Restore old or damaged photos",
    status: "installed",
    installedVersion: "1.0.0",
    estimatedSize: "800 MB - 1 GB",
    enablesTools: ["restore-photo"],
    progress: null,
    error: null,
  },
  {
    id: "ocr",
    name: "OCR",
    description: "Extract text from images",
    status: "installed",
    installedVersion: "1.0.0",
    estimatedSize: "3-4 GB",
    enablesTools: ["ocr"],
    progress: null,
    error: null,
  },
];

/* ────────────────────── helpers ────────────────────── */

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isoDaysAgo(days: number, extraMinutes = 0): string {
  return new Date(Date.now() - days * 86_400_000 - extraMinutes * 60_000).toISOString();
}

let idCounter = 5000;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter.toString(36)}`;
}

function randHex(len: number): string {
  const bytes = new Uint8Array(Math.ceil(len / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, len);
}

function parseBody(body: unknown): Record<string, unknown> {
  if (typeof body === "string" && body.length > 0) {
    try {
      const parsed = JSON.parse(body);
      return typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

/* ────────────────────── seeded demo dataset ──────────────────────
   Realistic sample content so every admin surface looks like a real
   instance. Mutations below edit this in-memory copy, so the People,
   Teams, Roles, and API-key buttons genuinely work for the session
   (a hard refresh reseeds). File processing stays disabled. */

interface DemoUser {
  id: string;
  username: string;
  role: string;
  team: string;
  authProvider: string;
  email: string;
  hasLocalPassword: boolean;
  hasOidcLink: boolean;
  createdAt: string;
}

interface DemoTeam {
  id: string;
  name: string;
  memberCount: number;
  storageQuota: number | null;
  retentionHours: number | null;
  createdAt: string;
}

interface DemoRole {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  toolPermissions: Record<string, unknown> | null;
  isBuiltin: boolean;
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

interface DemoApiKey {
  id: string;
  name: string;
  prefix: string;
  permissions: string[] | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

interface DemoAuditEntry {
  id: string;
  actorId: string | null;
  actorUsername: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  requestId: string | null;
  createdAt: string;
}

const db: {
  users: DemoUser[];
  teams: DemoTeam[];
  roles: DemoRole[];
  apiKeys: DemoApiKey[];
  audit: DemoAuditEntry[];
  settings: Record<string, string>;
  preferences: Record<string, unknown>;
} = {
  users: [
    {
      id: "usr_demo",
      username: "demo",
      role: "admin",
      team: "Platform",
      authProvider: "local",
      email: "demo@snapotter.example",
      hasLocalPassword: true,
      hasOidcLink: false,
      createdAt: isoDaysAgo(412),
    },
    {
      id: "usr_emma",
      username: "emma.whitfield",
      role: "admin",
      team: "Platform",
      authProvider: "local",
      email: "emma.whitfield@snapotter.example",
      hasLocalPassword: true,
      hasOidcLink: false,
      createdAt: isoDaysAgo(388),
    },
    {
      id: "usr_james",
      username: "james.carter",
      role: "editor",
      team: "Marketing",
      authProvider: "local",
      email: "james.carter@snapotter.example",
      hasLocalPassword: true,
      hasOidcLink: false,
      createdAt: isoDaysAgo(301),
    },
    {
      id: "usr_olivia",
      username: "olivia.bennett",
      role: "editor",
      team: "Design",
      authProvider: "oidc",
      email: "olivia.bennett@snapotter.example",
      hasLocalPassword: false,
      hasOidcLink: true,
      createdAt: isoDaysAgo(266),
    },
    {
      id: "usr_william",
      username: "william.hayes",
      role: "user",
      team: "Marketing",
      authProvider: "local",
      email: "william.hayes@snapotter.example",
      hasLocalPassword: true,
      hasOidcLink: false,
      createdAt: isoDaysAgo(214),
    },
    {
      id: "usr_sophia",
      username: "sophia.turner",
      role: "user",
      team: "Design",
      authProvider: "local",
      email: "sophia.turner@snapotter.example",
      hasLocalPassword: true,
      hasOidcLink: false,
      createdAt: isoDaysAgo(190),
    },
    {
      id: "usr_benjamin",
      username: "benjamin.foster",
      role: "user",
      team: "Support",
      authProvider: "oidc",
      email: "benjamin.foster@snapotter.example",
      hasLocalPassword: false,
      hasOidcLink: true,
      createdAt: isoDaysAgo(142),
    },
    {
      id: "usr_charlotte",
      username: "charlotte.reed",
      role: "user",
      team: "Support",
      authProvider: "local",
      email: "charlotte.reed@snapotter.example",
      hasLocalPassword: true,
      hasOidcLink: false,
      createdAt: isoDaysAgo(97),
    },
    {
      id: "usr_henry",
      username: "henry.morgan",
      role: "user",
      team: "Platform",
      authProvider: "local",
      email: "henry.morgan@snapotter.example",
      hasLocalPassword: true,
      hasOidcLink: false,
      createdAt: isoDaysAgo(58),
    },
    {
      id: "usr_grace",
      username: "grace.sullivan",
      role: "user",
      team: "Design",
      authProvider: "local",
      email: "grace.sullivan@snapotter.example",
      hasLocalPassword: true,
      hasOidcLink: false,
      createdAt: isoDaysAgo(21),
    },
  ],
  teams: [
    {
      id: "team_platform",
      name: "Platform",
      memberCount: 3,
      storageQuota: null,
      retentionHours: null,
      createdAt: isoDaysAgo(412),
    },
    {
      id: "team_marketing",
      name: "Marketing",
      memberCount: 2,
      storageQuota: 10_737_418_240,
      retentionHours: 720,
      createdAt: isoDaysAgo(360),
    },
    {
      id: "team_design",
      name: "Design",
      memberCount: 3,
      storageQuota: 21_474_836_480,
      retentionHours: 2160,
      createdAt: isoDaysAgo(322),
    },
    {
      id: "team_support",
      name: "Support",
      memberCount: 2,
      storageQuota: 5_368_709_120,
      retentionHours: 168,
      createdAt: isoDaysAgo(180),
    },
  ],
  roles: [
    {
      id: "role_admin",
      name: "admin",
      description: "Full access to every setting, user, and tool.",
      permissions: [...PERMISSIONS],
      toolPermissions: null,
      isBuiltin: true,
      userCount: 2,
      createdAt: isoDaysAgo(412),
      updatedAt: isoDaysAgo(412),
    },
    {
      id: "role_editor",
      name: "editor",
      description: "Run every tool, manage shared files and pipelines.",
      permissions: [
        "tools:use",
        "files:own",
        "files:all",
        "apikeys:own",
        "pipelines:own",
        "pipelines:all",
        "settings:read",
      ],
      toolPermissions: null,
      isBuiltin: true,
      userCount: 2,
      createdAt: isoDaysAgo(412),
      updatedAt: isoDaysAgo(412),
    },
    {
      id: "role_user",
      name: "user",
      description: "Run tools and manage your own files and keys.",
      permissions: ["tools:use", "files:own", "apikeys:own", "pipelines:own"],
      toolPermissions: null,
      isBuiltin: true,
      userCount: 5,
      createdAt: isoDaysAgo(412),
      updatedAt: isoDaysAgo(412),
    },
    {
      id: "role_auditor",
      name: "Auditor",
      description: "Read-only access to audit logs and system health.",
      permissions: ["audit:read", "system:health", "settings:read"],
      toolPermissions: null,
      isBuiltin: false,
      userCount: 1,
      createdAt: isoDaysAgo(120),
      updatedAt: isoDaysAgo(34),
    },
  ],
  apiKeys: [
    {
      id: "key_ci",
      name: "CI/CD Pipeline",
      prefix: "si_7f3a9c2e",
      permissions: null,
      createdAt: isoDaysAgo(203),
      lastUsedAt: isoDaysAgo(0, 47),
      expiresAt: null,
    },
    {
      id: "key_zapier",
      name: "Zapier Integration",
      prefix: "si_2b8d4f1a",
      permissions: ["tools:use", "files:own"],
      createdAt: isoDaysAgo(88),
      lastUsedAt: isoDaysAgo(1, 320),
      expiresAt: isoDaysAgo(-90),
    },
    {
      id: "key_backup",
      name: "Nightly Backup",
      prefix: "si_9e5c1d7b",
      permissions: ["files:all"],
      createdAt: isoDaysAgo(51),
      lastUsedAt: null,
      expiresAt: null,
    },
  ],
  audit: seedAudit(),
  settings: {
    fileUploadLimitMb: "200",
    defaultTheme: "system",
    defaultLocale: "en",
    loginAttemptLimit: "5",
    tempFileMaxAgeHours: "24",
    startupCleanup: "true",
    analyticsEnabled: "false",
    jobsRetentionDays: "30",
    auditRetentionDays: "90",
    sessionIdleTimeoutMinutes: "60",
    maxSessionsPerUser: "5",
    mfaPolicy: "optional",
    ssoEnforcement: "false",
    ssoBreakGlassUsername: "",
    passwordMinLength: "8",
    passwordRequireUppercase: "true",
    passwordRequireNumber: "true",
    passwordRequireSpecial: "false",
    disabledTools: "[]",
    enableExperimentalTools: "false",
    defaultToolView: "sidebar",
  },
  preferences: {
    defaultToolView: "sidebar",
    pinnedTools: ["compress-image", "remove-background", "pdf-merge", "resize-image"],
  },
};

function seedAudit(): DemoAuditEntry[] {
  const templates: Array<Omit<DemoAuditEntry, "id" | "createdAt" | "ipAddress"> & { ip: string }> =
    [
      {
        actorId: "usr_demo",
        actorUsername: "demo",
        action: "LOGIN_SUCCESS",
        targetType: null,
        targetId: null,
        details: null,
        requestId: null,
        ip: "203.0.113.24",
      },
      {
        actorId: "usr_emma",
        actorUsername: "emma.whitfield",
        action: "SETTINGS_UPDATED",
        targetType: "setting",
        targetId: "analyticsEnabled",
        details: { from: "true", to: "false" },
        requestId: null,
        ip: "198.51.100.7",
      },
      {
        actorId: "usr_demo",
        actorUsername: "demo",
        action: "USER_CREATED",
        targetType: "user",
        targetId: "grace.sullivan",
        details: { role: "user", team: "Design" },
        requestId: null,
        ip: "203.0.113.24",
      },
      {
        actorId: "usr_james",
        actorUsername: "james.carter",
        action: "TOOL_EXECUTED",
        targetType: "tool",
        targetId: "compress-image",
        details: { inputBytes: 4_812_004, outputBytes: 1_204_881 },
        requestId: null,
        ip: "198.51.100.44",
      },
      {
        actorId: "usr_emma",
        actorUsername: "emma.whitfield",
        action: "API_KEY_CREATED",
        targetType: "apiKey",
        targetId: "CI/CD Pipeline",
        details: { permissions: "all" },
        requestId: null,
        ip: "198.51.100.7",
      },
      {
        actorId: "usr_olivia",
        actorUsername: "olivia.bennett",
        action: "OIDC_LOGIN_SUCCESS",
        targetType: null,
        targetId: null,
        details: { provider: "google" },
        requestId: null,
        ip: "192.0.2.53",
      },
      {
        actorId: "usr_william",
        actorUsername: "william.hayes",
        action: "BATCH_EXECUTED",
        targetType: "tool",
        targetId: "resize-image",
        details: { files: 48 },
        requestId: null,
        ip: "192.0.2.128",
      },
      {
        actorId: null,
        actorUsername: "unknown",
        action: "LOGIN_FAILED",
        targetType: null,
        targetId: null,
        details: { reason: "invalid_password", username: "james.carter" },
        requestId: null,
        ip: "45.148.10.211",
      },
      {
        actorId: "usr_demo",
        actorUsername: "demo",
        action: "ROLE_CREATED",
        targetType: "role",
        targetId: "Auditor",
        details: { permissions: ["audit:read", "system:health"] },
        requestId: null,
        ip: "203.0.113.24",
      },
      {
        actorId: "usr_sophia",
        actorUsername: "sophia.turner",
        action: "PIPELINE_EXECUTED",
        targetType: "pipeline",
        targetId: "Social media export",
        details: { steps: 4 },
        requestId: null,
        ip: "192.0.2.77",
      },
      {
        actorId: "usr_emma",
        actorUsername: "emma.whitfield",
        action: "PASSWORD_RESET",
        targetType: "user",
        targetId: "benjamin.foster",
        details: null,
        requestId: null,
        ip: "198.51.100.7",
      },
      {
        actorId: "usr_benjamin",
        actorUsername: "benjamin.foster",
        action: "FILE_UPLOADED",
        targetType: "file",
        targetId: "quarterly-report.pdf",
        details: { bytes: 2_204_112 },
        requestId: null,
        ip: "203.0.113.190",
      },
      {
        actorId: "usr_demo",
        actorUsername: "demo",
        action: "USER_UPDATED",
        targetType: "user",
        targetId: "william.hayes",
        details: { role: { from: "user", to: "editor" } },
        requestId: null,
        ip: "203.0.113.24",
      },
      {
        actorId: "usr_henry",
        actorUsername: "henry.morgan",
        action: "TOOL_EXECUTED",
        targetType: "tool",
        targetId: "remove-background",
        details: { inputBytes: 3_004_221 },
        requestId: null,
        ip: "192.0.2.201",
      },
    ];

  const entries: DemoAuditEntry[] = [];
  // Two passes over the templates give ~28 rows, enough to page.
  for (let pass = 0; pass < 2; pass++) {
    templates.forEach((tpl, i) => {
      const index = pass * templates.length + i;
      const { ip, ...rest } = tpl;
      entries.push({
        ...rest,
        id: `audit_${index.toString(36)}`,
        ipAddress: ip,
        requestId: `req_${randHex(12)}`,
        createdAt: isoDaysAgo(0, index * 143 + pass * 37),
      });
    });
  }
  return entries;
}

function buildUsage(days: number): unknown {
  const clamped = Math.min(Math.max(days, 1), 90);
  const jobsPerDay: Array<{ day: string; total: number; completed: number; failed: number }> = [];
  for (let i = clamped - 1; i >= 0; i--) {
    const seed = Math.abs(Math.sin((i + 1) * 12.9898) * 43_758.5453);
    const wave = seed - Math.floor(seed);
    const total = 45 + Math.floor(wave * 165);
    const failed = Math.floor((Math.abs(Math.sin((i + 5) * 7.13)) % 1) * 7);
    const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    jobsPerDay.push({ day, total, completed: total - failed, failed });
  }

  return {
    days: clamped,
    jobsPerDay,
    topTools: [
      { toolId: "compress-image", runs: 1842 },
      { toolId: "remove-background", runs: 1310 },
      { toolId: "jpg-to-png", runs: 1105 },
      { toolId: "pdf-merge", runs: 998 },
      { toolId: "resize-image", runs: 940 },
      { toolId: "mp4-to-gif", runs: 721 },
      { toolId: "upscale", runs: 655 },
      { toolId: "ocr", runs: 540 },
      { toolId: "watermark-image", runs: 486 },
      { toolId: "split-pdf", runs: 431 },
    ],
    perUser: [
      { username: "emma.whitfield", runs: 1240, bytesIn: "5368709120" },
      { username: "james.carter", runs: 982, bytesIn: "3221225472" },
      { username: "olivia.bennett", runs: 871, bytesIn: "2952790016" },
      { username: "william.hayes", runs: 640, bytesIn: "1610612736" },
      { username: "sophia.turner", runs: 512, bytesIn: "1288490188" },
      { username: "benjamin.foster", runs: 388, bytesIn: "912680550" },
      { username: null, runs: 264, bytesIn: "704643072" },
    ],
    durations: [
      { pool: "image", p50Ms: 320, p95Ms: 1180 },
      { pool: "media", p50Ms: 4200, p95Ms: 18_500 },
      { pool: "ai", p50Ms: 8600, p95Ms: 42_000 },
      { pool: "docs", p50Ms: 1500, p95Ms: 6400 },
      { pool: "system", p50Ms: 40, p95Ms: 180 },
    ],
    storage: { libraryBytes: "48318382080", libraryFiles: 3187 },
    teamStorage: [
      { teamName: "Design", totalBytes: "21474836480", userCount: 3 },
      { teamName: "Platform", totalBytes: "12884901888", userCount: 3 },
      { teamName: "Marketing", totalBytes: "6442450944", userCount: 2 },
      { teamName: "Support", totalBytes: "3221225472", userCount: 2 },
    ],
  };
}

/* ────────────────────── persisted flags ────────────────────── */

const STATE_KEY = "snapotter-demo-state";

function loadState(): { passwordChanged: boolean } {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { passwordChanged: false };
}

function saveState(patch: Partial<ReturnType<typeof loadState>>) {
  const state = { ...loadState(), ...patch };
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

const DEMO_DISABLED_MESSAGE =
  "This is a demo instance. To use this, self-host SnapOtter from GitHub → github.com/snapotter-hq/SnapOtter";

/* ────────────────────── router ────────────────────── */

export function matchDemoRoute(url: string, method: string, body?: unknown): Response | null {
  const parsed = new URL(url, "http://localhost");
  const path = parsed.pathname;
  const query = parsed.searchParams;

  /* ---- auth / config ---- */

  if (path === "/api/v1/config/auth" && method === "GET") {
    return json({
      authEnabled: true,
      oidcEnabled: false,
      oidcProviderName: null,
      samlEnabled: false,
      samlProviderName: null,
      ssoEnforced: false,
    });
  }

  if (path === "/api/v1/config/locale" && method === "GET") {
    return json({ defaultLocale: "en" });
  }

  if (path === "/api/v1/config/analytics" && method === "GET") {
    return json({
      enabled: false,
      posthogApiKey: "",
      posthogHost: "",
      sentryDsn: "",
      sampleRate: 0,
      instanceId: "",
    });
  }

  if (path === "/api/auth/login" && method === "POST") {
    localStorage.setItem("snapotter-token", "demo-token");
    return json({ token: "demo-token" });
  }

  if (path === "/api/auth/session" && method === "GET") {
    // The demo is always signed in as an admin, so it boots straight into the
    // dashboard with no login or change-password screen, and every settings
    // tab (including the auth-gated People/Teams/Roles/Security ones) stays
    // available. mustChangePassword is always false; the session is returned
    // regardless of token so a stray logout can't drop you onto /login.
    return json({
      user: {
        id: 1,
        username: "demo",
        displayName: "Demo User",
        role: "admin",
        permissions: PERMISSIONS,
        mustChangePassword: false,
        mfaRequired: false,
        loginMethod: "local",
        hasLocalPassword: true,
      },
    });
  }

  if (path === "/api/auth/logout" && method === "POST") {
    localStorage.removeItem("snapotter-token");
    localStorage.removeItem(STATE_KEY);
    return json({ ok: true });
  }

  if (path === "/api/auth/change-password" && method === "POST") {
    saveState({ passwordChanged: true });
    return json({ ok: true });
  }

  if (path === "/api/v1/health") {
    return json({ status: "ok", version: DEMO_APP_VERSION });
  }

  /* ---- people (users) ---- */

  if (path === "/api/auth/users" && method === "GET") {
    return json({ users: db.users, maxUsers: 0 });
  }

  if (path === "/api/auth/register" && method === "POST") {
    const b = parseBody(body);
    const username = String(b.username ?? "").trim();
    if (!username) return json({ error: "Username is required" }, 400);
    if (db.users.some((u) => u.username === username)) {
      return json({ error: "A user with that name already exists." }, 400);
    }
    const user: DemoUser = {
      id: nextId("usr"),
      username,
      role: String(b.role ?? "user"),
      team: String(b.team ?? "Default"),
      authProvider: "local",
      email: `${username}@snapotter.example`,
      hasLocalPassword: true,
      hasOidcLink: false,
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    return json({ ok: true, user });
  }

  const resetMatch = path.match(/^\/api\/auth\/users\/([^/]+)\/reset-password$/);
  if (resetMatch && method === "POST") {
    return json({ ok: true });
  }

  const userMatch = path.match(/^\/api\/auth\/users\/([^/]+)$/);
  if (userMatch) {
    const id = userMatch[1];
    const user = db.users.find((u) => u.id === id);
    if (method === "PUT") {
      if (!user) return json({ error: "User not found" }, 404);
      const b = parseBody(body);
      if (typeof b.role === "string") user.role = b.role;
      if (typeof b.team === "string") user.team = b.team;
      return json({ ok: true, user });
    }
    if (method === "DELETE") {
      db.users = db.users.filter((u) => u.id !== id);
      return json({ ok: true });
    }
  }

  /* ---- teams ---- */

  if (path === "/api/v1/teams" && method === "GET") {
    return json({ teams: db.teams });
  }

  if (path === "/api/v1/teams" && method === "POST") {
    const b = parseBody(body);
    const name = String(b.name ?? "").trim();
    if (!name) return json({ error: "Team name is required" }, 400);
    const team: DemoTeam = {
      id: nextId("team"),
      name,
      memberCount: 0,
      storageQuota: null,
      retentionHours: null,
      createdAt: new Date().toISOString(),
    };
    db.teams.push(team);
    return json({ ok: true, team });
  }

  const teamMatch = path.match(/^\/api\/v1\/teams\/([^/]+)$/);
  if (teamMatch) {
    const id = teamMatch[1];
    const team = db.teams.find((t) => t.id === id);
    if (method === "PUT") {
      if (!team) return json({ error: "Team not found" }, 404);
      const b = parseBody(body);
      if (typeof b.name === "string") team.name = b.name;
      if ("storageQuota" in b) team.storageQuota = b.storageQuota as number | null;
      if ("retentionHours" in b) team.retentionHours = b.retentionHours as number | null;
      return json({ ok: true, team });
    }
    if (method === "DELETE") {
      db.teams = db.teams.filter((t) => t.id !== id);
      return json({ ok: true });
    }
  }

  /* ---- roles ---- */

  if (path === "/api/v1/roles" && method === "GET") {
    return json({ roles: db.roles });
  }

  if (path === "/api/v1/roles" && method === "POST") {
    const b = parseBody(body);
    const name = String(b.name ?? "").trim();
    if (!name) return json({ error: "Role name is required" }, 400);
    const now = new Date().toISOString();
    const role: DemoRole = {
      id: nextId("role"),
      name,
      description: String(b.description ?? ""),
      permissions: Array.isArray(b.permissions) ? (b.permissions as string[]) : [],
      toolPermissions: null,
      isBuiltin: false,
      userCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    db.roles.push(role);
    return json({ ok: true, role });
  }

  const roleMatch = path.match(/^\/api\/v1\/roles\/([^/]+)$/);
  if (roleMatch) {
    const id = roleMatch[1];
    const role = db.roles.find((r) => r.id === id);
    if (method === "PUT") {
      if (!role) return json({ error: "Role not found" }, 404);
      const b = parseBody(body);
      if (typeof b.name === "string") role.name = b.name;
      if (typeof b.description === "string") role.description = b.description;
      if (Array.isArray(b.permissions)) role.permissions = b.permissions as string[];
      role.updatedAt = new Date().toISOString();
      return json({ ok: true, role });
    }
    if (method === "DELETE") {
      db.roles = db.roles.filter((r) => r.id !== id);
      return json({ ok: true });
    }
  }

  /* ---- api keys ---- */

  if (path === "/api/v1/api-keys" && method === "GET") {
    return json({ apiKeys: db.apiKeys });
  }

  if (path === "/api/v1/api-keys" && method === "POST") {
    const b = parseBody(body);
    const name = String(b.name ?? "Untitled key").trim() || "Untitled key";
    const prefix = `si_${randHex(8)}`;
    const key: DemoApiKey = {
      id: nextId("key"),
      name,
      prefix,
      permissions: Array.isArray(b.permissions) ? (b.permissions as string[]) : null,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: typeof b.expiresAt === "string" ? b.expiresAt : null,
    };
    db.apiKeys.push(key);
    // The raw key is shown once; downstream code reads `key`.
    return json({
      id: key.id,
      key: `${prefix}_${randHex(32)}`,
      name: key.name,
      prefix: key.prefix,
      permissions: key.permissions,
      expiresAt: key.expiresAt,
      createdAt: key.createdAt,
    });
  }

  const apiKeyMatch = path.match(/^\/api\/v1\/api-keys\/([^/]+)$/);
  if (apiKeyMatch && method === "DELETE") {
    db.apiKeys = db.apiKeys.filter((k) => k.id !== apiKeyMatch[1]);
    return json({ ok: true });
  }

  /* ---- audit log ---- */

  if (path === "/api/v1/audit-log" && method === "GET") {
    const page = Math.max(1, Number(query.get("page") || "1"));
    const limit = Math.max(1, Number(query.get("limit") || "25"));
    const action = query.get("action") || "";
    const filtered = action ? db.audit.filter((e) => e.action === action) : db.audit;
    const start = (page - 1) * limit;
    return json({
      entries: filtered.slice(start, start + limit),
      total: filtered.length,
      page,
      limit,
    });
  }

  /* ---- settings + preferences ---- */

  if (path === "/api/v1/settings" && method === "GET") {
    return json({ settings: db.settings });
  }

  if (path === "/api/v1/settings" && method === "PUT") {
    const b = parseBody(body);
    for (const [k, v] of Object.entries(b)) {
      db.settings[k] = typeof v === "string" ? v : String(v);
    }
    return json({ ok: true, updatedCount: Object.keys(b).length });
  }

  if (path === "/api/v1/preferences" && method === "GET") {
    return json({ preferences: db.preferences });
  }

  if (path === "/api/v1/preferences" && method === "PUT") {
    const b = parseBody(body);
    db.preferences = { ...db.preferences, ...b };
    return json({ ok: true });
  }

  /* ---- features / usage ---- */

  if (path === "/api/v1/features" && method === "GET") {
    return json({ bundles: FEATURE_BUNDLES });
  }

  if (path === "/api/v1/admin/features/disk-usage" && method === "GET") {
    return json({ totalBytes: 15_942_918_144 });
  }

  if (path === "/api/v1/admin/usage" && method === "GET") {
    return json(buildUsage(Number(query.get("days") || "30")));
  }

  /* ---- processing / uploads: disabled in the demo ---- */

  if (path.startsWith("/api/v1/tools/") && method === "POST") {
    return json({ error: DEMO_DISABLED_MESSAGE }, 403);
  }

  if ((path === "/api/v1/upload" || path === "/api/v1/files/upload") && method === "POST") {
    return json({ error: DEMO_DISABLED_MESSAGE }, 403);
  }

  if (path === "/api/v1/files" && method === "GET") {
    return json({ files: [], total: 0 });
  }

  if (path === "/api/v1/files" && method === "DELETE") {
    return json({ deleted: 0 });
  }

  if (path.startsWith("/api/v1/pipelines") && method === "GET") {
    return json({ pipelines: [] });
  }

  if (path.startsWith("/api/v1/pipelines") && method === "POST") {
    return json({ error: DEMO_DISABLED_MESSAGE }, 403);
  }

  // Remaining admin-only mutating endpoints (support bundle, feature import,
  // etc.) are not simulated; report them as demo-disabled rather than 500.
  if (path.startsWith("/api/v1/admin/")) {
    return json({ error: "Admin actions are disabled in this demo." }, 403);
  }

  // Unknown GETs fall through to a harmless empty object; unknown mutations
  // acknowledge success so buttons never surface a 500.
  if (path.startsWith("/api/")) {
    return json({ ok: true });
  }

  return null;
}

/**
 * Boot the demo as an already-signed-in admin so there is no login screen.
 * Runs before the app mounts: seeds an auth token and, if the URL is a login
 * or change-password route (manual navigation, or the logout redirect),
 * rewrites it to the dashboard before React Router reads the location.
 */
function primeDemoAuth() {
  try {
    localStorage.setItem("snapotter-token", "demo-token");
    localStorage.setItem("snapotter-username", "demo");
  } catch {}
  const p = window.location.pathname;
  if (p === "/login" || p === "/change-password") {
    window.history.replaceState(null, "", "/");
  }
}

export function installMocks() {
  primeDemoAuth();

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method?.toUpperCase() || "GET";

    const mock = matchDemoRoute(url, method, init?.body);
    if (mock) return mock;

    return originalFetch(input, init);
  };

  const OriginalXHR = window.XMLHttpRequest;
  const MockXHR = class extends OriginalXHR {
    private _url = "";
    private _method = "";

    open(method: string, url: string | URL, ...args: unknown[]) {
      this._method = method.toUpperCase();
      this._url = typeof url === "string" ? url : url.href;
      // @ts-expect-error -- variadic override
      super.open(method, url, ...args);
    }

    send(body?: Document | XMLHttpRequestBodyInit | null) {
      if (this._url.startsWith("/api/")) {
        const mock = matchDemoRoute(this._url, this._method, body);
        if (mock) {
          setTimeout(async () => {
            const responseText = await mock.text();
            Object.defineProperty(this, "status", { value: mock.status, writable: false });
            Object.defineProperty(this, "readyState", { value: 4, writable: false });
            Object.defineProperty(this, "responseText", { value: responseText, writable: false });
            Object.defineProperty(this, "response", { value: responseText, writable: false });
            this.dispatchEvent(new Event("loadstart"));
            this.dispatchEvent(new ProgressEvent("progress", { loaded: 100, total: 100 }));
            if (this.upload) {
              this.upload.dispatchEvent(new ProgressEvent("progress", { loaded: 100, total: 100 }));
              this.upload.dispatchEvent(new ProgressEvent("load", { loaded: 100, total: 100 }));
            }
            this.dispatchEvent(new Event("load"));
            this.dispatchEvent(new Event("loadend"));
            if (typeof this.onreadystatechange === "function") {
              this.onreadystatechange(new Event("readystatechange") as ProgressEvent);
            }
            if (typeof this.onload === "function") {
              this.onload(new ProgressEvent("load"));
            }
          }, 100);
          return;
        }
      }
      super.send(body);
    }
  };

  window.XMLHttpRequest = MockXHR as unknown as typeof XMLHttpRequest;

  const originalSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    if (this.method.toUpperCase() === "POST") {
      const target = this.action || window.location.href;
      const url = new URL(target, window.location.origin);
      window.location.href = url.pathname;
      return;
    }
    originalSubmit.call(this);
  };

  const OriginalEventSource = window.EventSource;
  window.EventSource = class extends OriginalEventSource {
    constructor(url: string | URL, init?: EventSourceInit) {
      const urlStr = typeof url === "string" ? url : url.href;
      if (urlStr.startsWith("/api/")) {
        super("about:blank", init);
        setTimeout(() => this.close(), 0);
        return;
      }
      super(url, init);
    }
  } as typeof EventSource;
}
