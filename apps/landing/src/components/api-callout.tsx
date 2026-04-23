import { FadeIn } from "./fade-in";

const request = `curl -X POST https://your-server/api/tools/resize \\
  -H "X-API-Key: sk_live_..." \\
  -F "image=@photo.jpg" \\
  -F "width=800"`;

const response = `{
  "success": true,
  "output": "resized_photo.jpg",
  "metadata": {
    "width": 800,
    "height": 600,
    "format": "jpeg",
    "size": "124KB"
  }
}`;

export function ApiCallout() {
  return (
    <section className="px-6 py-24 md:py-36">
      <div className="mx-auto max-w-6xl">
        <FadeIn>
          <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
            API-first by design.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-lg text-muted">
            Every tool accessible via HTTP. OpenAPI documentation included.
          </p>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="border-b border-border bg-background-alt px-4 py-2 text-xs font-medium text-muted">
                Request
              </div>
              <pre className="overflow-x-auto bg-dark-bg p-4 font-mono text-sm leading-relaxed text-dark-fg">
                {request}
              </pre>
            </div>
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="border-b border-border bg-background-alt px-4 py-2 text-xs font-medium text-muted">
                Response
              </div>
              <pre className="overflow-x-auto bg-dark-bg p-4 font-mono text-sm leading-relaxed text-dark-fg">
                {response}
              </pre>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.2}>
          <p className="mt-8 text-center">
            <a
              href="https://docs.snapotter.com"
              className="text-accent font-medium hover:underline"
            >
              Explore the API Docs &rarr;
            </a>
          </p>
        </FadeIn>
      </div>
    </section>
  );
}
