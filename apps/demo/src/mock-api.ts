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

const STATE_KEY = "snapotter-demo-state";

function loadState(): {
  passwordChanged: boolean;
} {
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

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function matchRoute(url: string, method: string): Response | null {
  const path = new URL(url, "http://localhost").pathname;

  if (path === "/api/v1/config/auth" && method === "GET") {
    return json({ authEnabled: true, oidcEnabled: false });
  }

  if (path === "/api/auth/login" && method === "POST") {
    localStorage.setItem("snapotter-token", "demo-token");
    return json({ token: "demo-token" });
  }

  if (path === "/api/auth/session" && method === "GET") {
    const token = localStorage.getItem("snapotter-token");
    if (!token) return json({ error: "Unauthorized" }, 401);
    const state = loadState();
    return json({
      user: {
        id: 1,
        username: "demo",
        displayName: "Demo User",
        role: "admin",
        permissions: PERMISSIONS,
        mustChangePassword: !state.passwordChanged,
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

  if (path === "/api/v1/health") {
    return json({ status: "ok", version: "1.17.0" });
  }

  if (path === "/api/v1/settings" && method === "GET") {
    return json({
      settings: {
        disabledTools: "[]",
        enableExperimentalTools: "false",
        defaultToolView: "sidebar",
        defaultTheme: "system",
        analyticsEnabled: "false",
      },
    });
  }

  if (path === "/api/v1/settings" && method === "PUT") {
    return json({ ok: true, updatedCount: 0 });
  }

  if (path === "/api/v1/features" && method === "GET") {
    return json({ bundles: FEATURE_BUNDLES });
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

  if (path.startsWith("/api/v1/tools/") && method === "POST") {
    return json(
      {
        error:
          "This is a demo instance. To process files, self-host SnapOtter from GitHub → github.com/snapotter-hq/SnapOtter",
      },
      403,
    );
  }

  if (path === "/api/v1/upload" && method === "POST") {
    return json(
      {
        error:
          "This is a demo instance. To upload files, self-host SnapOtter from GitHub → github.com/snapotter-hq/SnapOtter",
      },
      403,
    );
  }

  if (path === "/api/v1/files" && method === "GET") {
    return json({ files: [], total: 0 });
  }

  if (path === "/api/v1/files" && method === "DELETE") {
    return json({ deleted: 0 });
  }

  if (path.startsWith("/api/v1/admin/")) {
    return json({ error: "Admin actions are disabled in this demo." }, 403);
  }

  if (path === "/api/auth/change-password" && method === "POST") {
    saveState({ passwordChanged: true });
    return json({ ok: true });
  }

  if (path.startsWith("/api/v1/pipelines") && method === "GET") {
    return json({ pipelines: [] });
  }

  if (path.startsWith("/api/v1/pipelines") && method === "POST") {
    return json({ error: "Pipelines are disabled in this demo." }, 403);
  }

  if (path.startsWith("/api/v1/audit") && method === "GET") {
    return json({ entries: [], total: 0 });
  }

  if (path.startsWith("/api/v1/users") && method === "GET") {
    return json({
      users: [
        {
          id: 1,
          username: "demo",
          displayName: "Demo User",
          role: "admin",
          createdAt: new Date().toISOString(),
        },
      ],
    });
  }

  if (path.startsWith("/api/v1/teams") && method === "GET") {
    return json({ teams: [] });
  }

  if (path.startsWith("/api/v1/apikeys") && method === "GET") {
    return json({ apiKeys: [] });
  }

  if (path.startsWith("/api/v1/roles") && method === "GET") {
    return json({ roles: [] });
  }

  if (path.startsWith("/api/")) {
    return json({ ok: true });
  }

  return null;
}

const originalFetch = window.fetch.bind(window);

export function installMocks() {
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method?.toUpperCase() || "GET";

    const mock = matchRoute(url, method);
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
        const mock = matchRoute(this._url, this._method);
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
