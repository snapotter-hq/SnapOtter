// Per-page JSON-LD structured data for the docs site. Kept free of vitepress
// imports so it stays a pure function the unit test can exercise directly
// (tests/unit/docs/jsonld.test.ts). config.mts wires the output into
// transformHead as <script type="application/ld+json"> tags.

export interface SectionCrumb {
  name: string;
  path: string;
}

// The docs site has no /guide, /tools, or /api index pages, so a breadcrumb
// cannot point a section node at a section landing page. These are the entry
// pages the top nav itself links each section to (see themeConfig.nav in
// config.mts): real, indexable URLs. The jsonld unit test asserts each target
// still exists, so a rename that would turn a breadcrumb into a 404 fails CI.
export const SECTION_CRUMB: Record<string, SectionCrumb> = {
  guide: { name: "Guide", path: "guide/getting-started" },
  tools: { name: "Tools", path: "tools/image/resize" },
  api: { name: "API Reference", path: "api/rest" },
};

export interface JsonLdInput {
  hostname: string;
  // Extension-less, locale-stripped page path: "" for the home page,
  // "guide/architecture" for a content page.
  enRel: string;
  // True for the translated trees, which transformHead marks noindex.
  isLocale: boolean;
  title: string;
  description?: string;
}

const CONTEXT = "https://schema.org";

const ORG_SAME_AS = [
  "https://github.com/snapotter-hq/snapotter",
  "https://x.com/SnapOtterHQ",
  "https://discord.gg/hr3s7HPUsr",
  "https://hub.docker.com/r/snapotter/snapotter",
];

function homeSchemas(hostname: string): Array<Record<string, unknown>> {
  return [
    {
      "@context": CONTEXT,
      "@type": "WebSite",
      name: "SnapOtter Docs",
      url: hostname,
      description:
        "Documentation for SnapOtter, the open-source self-hosted file-processing suite: setup guides, REST API reference, and per-tool docs.",
      publisher: {
        "@type": "Organization",
        name: "SnapOtter",
        logo: { "@type": "ImageObject", url: "https://snapotter.com/logo.png" },
        sameAs: ORG_SAME_AS,
      },
    },
    {
      "@context": CONTEXT,
      "@type": "SoftwareApplication",
      name: "SnapOtter",
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Docker, Linux, macOS, Windows",
      description:
        "Open-source, self-hosted file-processing suite with 200+ tools across image, video, audio, PDF, and documents.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      license: "https://www.gnu.org/licenses/agpl-3.0.en.html",
      downloadUrl: "https://hub.docker.com/r/snapotter/snapotter",
      url: "https://snapotter.com",
    },
  ];
}

function breadcrumb(hostname: string, enRel: string, title: string): Record<string, unknown> {
  const trail: Array<{ name: string; item: string }> = [{ name: "SnapOtter Docs", item: hostname }];
  const section = SECTION_CRUMB[enRel.split("/")[0]];
  // Skip the section node when the current page IS the section entry, so it is
  // not listed twice with the same URL.
  if (section && section.path !== enRel) {
    trail.push({ name: section.name, item: `${hostname}/${section.path}` });
  }
  trail.push({ name: title, item: `${hostname}/${enRel}` });
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: trail.map((node, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: node.name,
      item: node.item,
    })),
  };
}

function techArticle(
  hostname: string,
  enRel: string,
  title: string,
  description?: string,
): Record<string, unknown> {
  return {
    "@context": CONTEXT,
    "@type": "TechArticle",
    headline: title,
    ...(description ? { description } : {}),
    // image and author are Google-recommended Article fields. Every docs page
    // shares the site OG image and is authored by the project.
    image: `${hostname}/og-image.png`,
    author: { "@type": "Organization", name: "SnapOtter", url: "https://snapotter.com" },
    url: `${hostname}/${enRel}`,
    inLanguage: "en",
    isPartOf: { "@type": "WebSite", name: "SnapOtter Docs", url: hostname },
  };
}

export function buildJsonLd(input: JsonLdInput): Array<Record<string, unknown>> {
  const { hostname, enRel, isLocale, title, description } = input;
  // Only the indexable English pages carry structured data.
  if (isLocale) return [];
  if (enRel === "") return homeSchemas(hostname);
  return [breadcrumb(hostname, enRel, title), techArticle(hostname, enRel, title, description)];
}
