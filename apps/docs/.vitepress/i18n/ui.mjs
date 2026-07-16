// apps/docs/.vitepress/i18n/ui.mjs
import { SUPPORTED_LOCALES } from "../../../../packages/shared/src/i18n/index.ts";
import { OVERRIDES } from "./overrides.mjs";

// Source strings (English). Other locales override keys via ./overrides.mjs;
// missing keys fall back to English through t().
const EN = {
  // DocsHome.vue - hero
  "home.title": "SnapOtter Documentation",
  "home.heroSub":
    "Install, operate, and build on your self-hosted file-processing infrastructure. Get running in one command:",
  "home.copy": "Copy",
  "home.copied": "Copied!",
  "home.clickToCopy": "Click to copy",
  "home.copyCommandAria": "Copy command",
  "home.fullInstallGuide": "Full install guide",
  "home.gpuComposeSetup": "GPU & Compose setup",
  "home.tryDemo": "Try the live demo",
  // DocsHome.vue - doors
  "home.selfHosting": "Self-hosting",
  "home.selfHostingSub": "Get SnapOtter running and keep it healthy.",
  "home.enterprise": "Enterprise",
  "home.enterpriseSub": "Evaluate, secure & govern your deployment.",
  "home.startSelfHosting": "Start self-hosting →",
  "home.evaluate": "See enterprise features →",
  // DocsHome.vue - self-hosting links
  "home.link.quickStart": "Quick start",
  "home.link.configuration": "Configuration",
  "home.link.hardwareSizing": "Hardware & sizing",
  "home.link.databaseBackups": "Database & backups",
  "home.link.dockerTagsGpu": "Docker tags & GPU",
  "home.link.supportedFormats": "Supported formats",
  // DocsHome.vue - enterprise links
  "home.link.architecture": "Architecture",
  "home.link.securityHardening": "Security & hardening",
  "home.link.ssoSamlOidc": "SSO · SAML · OIDC",
  "home.link.scimProvisioning": "SCIM provisioning",
  "home.link.usersRolesAudit": "Users, roles & audit",
  "home.link.complianceSbom": "Compliance & SBOM",
  // DocsHome.vue - modalities
  "home.modalities": "200+ tools across 5 modalities",
  "home.browseByType": "browse the full reference by type",
  "home.mod.image": "Image",
  "home.mod.video": "Video",
  "home.mod.audio": "Audio",
  "home.mod.pdf": "PDF",
  "home.mod.files": "Files",
  "home.toolsSuffix": "tools",
  // DocsHome.vue - shared cards
  "home.card.restApi": "REST API",
  "home.card.restApiSub": "Keys, endpoints & OpenAPI",
  "home.card.changelog": "Changelog",
  "home.card.changelogSub": "What's new in 2.0",
  "home.card.llmsTxt": "llms.txt",
  "home.card.llmsTxtSub": "AI-friendly docs",
  // Top nav (config.mts)
  "nav.home": "Home",
  "nav.guide": "Guide",
  "nav.tools": "Tools",
  "nav.apiReference": "API Reference",
  "nav.changelog": "Changelog",
  // Sidebar structural labels (config.mts). Individual tool names stay English;
  // the acronym-only guide labels (OIDC / SSO, SAML SSO) are left untranslated.
  "sidebar.cat.essentials": "Essentials",
  "sidebar.cat.optimization": "Optimization",
  "sidebar.cat.adjustments": "Adjustments",
  "sidebar.cat.watermarkOverlay": "Watermark & Overlay",
  "sidebar.cat.utilities": "Utilities",
  "sidebar.cat.layout": "Layout",
  "sidebar.cat.format": "Format",
  "sidebar.cat.aiTools": "AI Tools",
  "sidebar.sec.apiReference": "API reference",
  "sidebar.sec.project": "Project",
  "sidebar.page.imageEngine": "Image engine",
  "sidebar.page.aiEngine": "AI engine",
  "sidebar.guide.gettingStarted": "Getting started",
  "sidebar.guide.architecture": "Architecture",
  "sidebar.guide.configuration": "Configuration",
  "sidebar.guide.scimProvisioning": "SCIM Provisioning",
  "sidebar.guide.usersRolesPermissions": "Users, Roles & Permissions",
  "sidebar.guide.database": "Database",
  "sidebar.guide.upgrading": "Upgrading from 1.x",
  "sidebar.guide.deployment": "Deployment",
  "sidebar.guide.securityHardening": "Security & Hardening",
  "sidebar.guide.telemetry": "What SnapOtter collects",
  "sidebar.guide.supportedFormats": "Supported Formats",
  "sidebar.guide.hardware": "Hardware requirements",
  "sidebar.guide.dockerTags": "Docker tags",
  "sidebar.guide.developer": "Developer guide",
  "sidebar.guide.translations": "Translation guide",
  "sidebar.guide.contributing": "Contributing",
  "sidebar.editLink": "Edit this page on GitHub",
  // FundButton.vue
  "fund.label": "Fund Development",
  // GitHubStars.vue
  "github.star": "Star",
  // Machine-translation banner
  "banner.text": "This page was machine-translated. Spotted a mistake?",
  "banner.cta": "Help improve it.",
  // not-found (Layout.vue)
  "notFound.heading": "Hello from the otter side!",
  "notFound.text": "This page swam away. Let's get you back on track.",
  "notFound.link": "Back to docs",
};

/**
 * @param {string} locale
 * @param {string} key
 * @returns {string}
 */
export function t(locale, key) {
  return OVERRIDES[locale]?.[key] ?? EN[key] ?? key;
}

/**
 * Normalize a VitePress lang to a catalog locale key (en for English variants).
 * @param {string} lang
 * @returns {string}
 */
export function normalizeLocale(lang) {
  const code = (lang || "en").trim();
  if (code === "en" || code.startsWith("en-")) return "en";
  return SUPPORTED_LOCALES.some((l) => l.code === code) ? code : "en";
}

export { EN, SUPPORTED_LOCALES };
