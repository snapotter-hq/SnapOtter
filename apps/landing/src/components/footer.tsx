import { Github } from "lucide-react";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Pricing", href: "/#pricing" },
      { label: "Enterprise", href: "/contact" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "https://docs.snapotter.com" },
      { label: "API Reference", href: "https://docs.snapotter.com/api" },
      {
        label: "Docker Hub",
        href: "https://hub.docker.com/r/snapotter/snapotter",
      },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "GitHub", href: "https://github.com/snapotter-hq/snapotter" },
      {
        label: "Contributing",
        href: "https://github.com/snapotter-hq/snapotter/blob/main/CONTRIBUTING.md",
      },
      {
        label: "Discussions",
        href: "https://github.com/snapotter-hq/snapotter/discussions",
      },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Licensing", href: "/#pricing" },
      { label: "Terms and Conditions", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "FAQ", href: "/faq" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-background-alt px-6 py-16">
      <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground text-sm font-bold">
              S
            </div>
            <span className="text-lg font-bold">SnapOtter</span>
          </div>
          <p className="mt-3 text-sm text-muted">
            Self-hosted image processing.
            <br />
            Your images, your infrastructure.
          </p>
        </div>

        {columns.map((col) => (
          <div key={col.title}>
            <h4 className="text-sm font-semibold">{col.title}</h4>
            <ul className="mt-4 space-y-3">
              {col.links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-muted transition-colors hover:text-foreground"
                    {...(link.href.startsWith("http")
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-12 flex max-w-6xl items-center justify-between border-t border-border pt-8">
        <p className="text-sm text-muted">&copy; {new Date().getFullYear()} SnapOtter</p>
        <a
          href="https://github.com/snapotter-hq/snapotter"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted transition-colors hover:text-foreground"
        >
          <Github size={20} />
        </a>
      </div>
    </footer>
  );
}
