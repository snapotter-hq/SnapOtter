import { Trash2 } from "lucide-react";
import { formatExifValue, SKIP_KEYS, UNSAFE_ROUND_TRIP_KEYS } from "@/lib/metadata-utils";

export function MetadataGrid({
  data,
  labelMap,
  onRemove,
  removedKeys,
}: {
  data: Record<string, unknown>;
  labelMap?: Record<string, string>;
  onRemove?: (key: string) => void;
  removedKeys?: Set<string>;
}) {
  const entries = Object.entries(data).filter(
    ([k, v]) =>
      !SKIP_KEYS.has(k) && !k.startsWith("_") && v !== undefined && v !== null && String(v) !== "",
  );

  if (entries.length === 0) {
    return <p className="text-[10px] text-muted-foreground italic">No data</p>;
  }

  const hasRemoveColumn = !!onRemove;

  return (
    <div
      className={`grid ${hasRemoveColumn ? "grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto]" : "grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"} gap-x-2 gap-y-0.5`}
    >
      {entries.map(([k, v]) => {
        const isRemoved = removedKeys?.has(k);
        const canRemove = onRemove && !UNSAFE_ROUND_TRIP_KEYS.has(k);
        return (
          <div key={k} className="contents">
            <div
              className={`text-[10px] text-muted-foreground truncate ${isRemoved ? "line-through opacity-50" : ""}`}
              title={k}
            >
              {labelMap?.[k] ?? k}
            </div>
            <div
              className={`text-[10px] text-foreground font-mono truncate ${isRemoved ? "line-through opacity-50" : ""}`}
              title={formatExifValue(k, v)}
            >
              {formatExifValue(k, v)}
            </div>
            {hasRemoveColumn && (
              <div className="flex items-center">
                {canRemove ? (
                  <button
                    type="button"
                    onClick={() => onRemove(k)}
                    className={`p-0.5 rounded hover:bg-muted/50 transition-colors ${isRemoved ? "text-red-500" : "text-muted-foreground hover:text-red-500"}`}
                    title={
                      isRemoved ? `Restore ${labelMap?.[k] ?? k}` : `Remove ${labelMap?.[k] ?? k}`
                    }
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                ) : (
                  <div className="w-3.5" />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
