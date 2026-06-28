import { type Modality, PIPELINE_TEMPLATES, type PipelineTemplate } from "@snapotter/shared";
import { useTranslation } from "@/contexts/i18n-context";
import { getModalityName } from "@/lib/tool-i18n";
import { TemplateCard } from "./template-card";

const MODALITY_ORDER: Modality[] = ["image", "document", "audio", "video", "file"];

interface TemplatesSectionProps {
  onUse: (template: PipelineTemplate) => void;
  emphasized: boolean;
}

export function TemplatesSection({ onUse, emphasized }: TemplatesSectionProps) {
  const { t } = useTranslation();

  const groups = MODALITY_ORDER.map((modality) => ({
    modality,
    templates: PIPELINE_TEMPLATES.filter((tpl) => tpl.modality === modality),
  })).filter((g) => g.templates.length > 0);

  return (
    <div
      data-testid="templates-section"
      className={`px-3 py-2 border-t border-border shrink-0 ${emphasized ? "bg-muted/30" : ""}`}
    >
      <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-1.5">
        {t.automate.templatesLabel}
      </h3>
      <div className="space-y-3 max-h-72 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.modality}>
            <div className="text-[11px] font-medium text-muted-foreground mb-1">
              {getModalityName(t, group.modality, group.modality)}
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {group.templates.map((tpl) => (
                <TemplateCard key={tpl.id} template={tpl} onUse={onUse} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
