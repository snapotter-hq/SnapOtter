import { FEATURE_BUNDLES, type PipelineTemplate, templateRequiredBundles } from "@snapotter/shared";
import { Download, Loader2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { getTemplateDescription, getTemplateName } from "@/lib/template-i18n";
import { getToolName } from "@/lib/tool-i18n";
import { useFeaturesStore } from "@/stores/features-store";

interface TemplateCardProps {
  template: PipelineTemplate;
  onUse: (template: PipelineTemplate) => void;
}

export function TemplateCard({ template, onUse }: TemplateCardProps) {
  const { t } = useTranslation();
  const bundles = useFeaturesStore((s) => s.bundles);
  const installing = useFeaturesStore((s) => s.installing);

  const requiredBundles = useMemo(() => templateRequiredBundles(template), [template]);

  const name = getTemplateName(t, template.id, template.id);
  const description = getTemplateDescription(t, template.id, "");

  return (
    <div
      data-testid={`template-card-${template.id}`}
      className="flex flex-col gap-1.5 p-2 rounded border border-border hover:border-primary/40 transition-colors"
    >
      <button
        type="button"
        onClick={() => onUse(template)}
        className="text-start"
        data-testid={`template-use-${template.id}`}
      >
        <span className="text-xs font-medium text-foreground hover:text-primary-ink">{name}</span>
        {description ? (
          <span className="block text-[11px] text-muted-foreground mt-0.5">{description}</span>
        ) : null}
      </button>

      <div className="flex flex-wrap items-center gap-1">
        {template.steps.map((step, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: steps are an ordered, static list with no stable id and may repeat a toolId
            key={`${step.toolId}-${i}`}
            className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
          >
            {getToolName(t, step.toolId, step.toolId)}
          </span>
        ))}
      </div>

      {requiredBundles.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {requiredBundles.map((bundleId) => {
            const installed = bundles.find((b) => b.id === bundleId)?.status === "installed";
            const isInstalling = Boolean(installing[bundleId]);
            const label = FEATURE_BUNDLES[bundleId]?.name ?? bundleId;
            return (
              <span
                key={bundleId}
                data-testid={`template-bundle-${template.id}-${bundleId}`}
                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/5 text-muted-foreground"
              >
                {isInstalling ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : installed ? null : (
                  <Download className="h-3 w-3" />
                )}
                {label}
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
