import { isTrimWindowTooShort } from "@snapotter/shared";
import { useEffect, useRef, useState } from "react";
import { TimecodeInput } from "@/components/common/timecode-input";
import { cn } from "@/lib/utils";

export type TrimMode = "range" | "ends";

export interface TrimValue {
  mode: TrimMode;
  startS: number;
  endS: number;
  cutStartS: number;
  cutEndS: number;
}

export interface TrimFieldLabels {
  mode: string;
  modeRange: string;
  modeEnds: string;
  start: string;
  end: string;
  rangeHint: string;
  cutStart: string;
  cutEnd: string;
  endsHint: string;
  timeFormatHint: string;
  endTimeMustBeAfter: string;
  nothingToCut: string;
  windowTooShort: string;
}

export function trimValueFrom(settings: Record<string, unknown>, fallback: TrimValue): TrimValue {
  const num = (key: keyof TrimValue) =>
    settings[key] != null ? Number(settings[key]) : (fallback[key] as number);
  return {
    mode: settings.mode === "ends" ? "ends" : fallback.mode,
    startS: num("startS"),
    endS: num("endS"),
    cutStartS: num("cutStartS"),
    cutEndS: num("cutEndS"),
  };
}

/** Only the active mode's fields go to the API, so a range never rides along with an ends cut. */
export function trimPayload(v: TrimValue): Record<string, unknown> {
  return v.mode === "ends"
    ? { mode: "ends", cutStartS: v.cutStartS, cutEndS: v.cutEndS }
    : { mode: "range", startS: v.startS, endS: v.endS };
}

export type TrimProblem = "endBeforeStart" | "nothingToCut" | "windowTooShort";

/** Ends cuts only resolve against the file's duration, so the server checks their window. */
export function trimProblem(v: TrimValue): TrimProblem | null {
  if (v.mode === "ends") return v.cutStartS + v.cutEndS > 0 ? null : "nothingToCut";
  if (v.endS <= v.startS) return "endBeforeStart";
  return isTrimWindowTooShort(v.startS, v.endS) ? "windowTooShort" : null;
}

const PROBLEM_LABEL = {
  endBeforeStart: "endTimeMustBeAfter",
  nothingToCut: "nothingToCut",
  windowTooShort: "windowTooShort",
} as const satisfies Record<TrimProblem, keyof TrimFieldLabels>;

interface TrimFieldsProps {
  idPrefix: string;
  value: TrimValue;
  onChange: (value: TrimValue) => void;
  labels: TrimFieldLabels;
  /** Reports whether every visible time field holds parseable text. */
  onTextValidityChange?: (valid: boolean) => void;
}

export function TrimFields({
  idPrefix,
  value,
  onChange,
  labels,
  onTextValidityChange,
}: TrimFieldsProps) {
  const [badFields, setBadFields] = useState<ReadonlySet<string>>(new Set());
  const formatHintId = `${idPrefix}-format-hint`;
  const modeHintId = `${idPrefix}-mode-hint`;
  const describedBy = `${modeHintId} ${formatHintId}`;
  const problem = trimProblem(value);

  const setFieldValid = (field: string, valid: boolean) =>
    setBadFields((prev) => {
      if (valid !== prev.has(field)) return prev;
      const next = new Set(prev);
      if (valid) next.delete(field);
      else next.add(field);
      return next;
    });

  const visibleFields = value.mode === "ends" ? ["cutStartS", "cutEndS"] : ["startS", "endS"];
  const textValid = !visibleFields.some((f) => badFields.has(f));
  const onTextValidityChangeRef = useRef(onTextValidityChange);
  useEffect(() => {
    onTextValidityChangeRef.current = onTextValidityChange;
  });
  useEffect(() => {
    onTextValidityChangeRef.current?.(textValid);
  }, [textValid]);

  const timeField = (field: keyof Omit<TrimValue, "mode">, idSuffix: string, label: string) => (
    <div>
      <label htmlFor={`${idPrefix}-${idSuffix}`} className="text-xs text-muted-foreground">
        {label}
      </label>
      <TimecodeInput
        id={`${idPrefix}-${idSuffix}`}
        value={value[field]}
        onChange={(seconds) => onChange({ ...value, [field]: seconds })}
        onValidityChange={(valid) => setFieldValid(field, valid)}
        describedBy={describedBy}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${idPrefix}-mode`} className="text-xs text-muted-foreground">
          {labels.mode}
        </label>
        <select
          id={`${idPrefix}-mode`}
          value={value.mode}
          onChange={(e) => onChange({ ...value, mode: e.target.value as TrimMode })}
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
        >
          <option value="range">{labels.modeRange}</option>
          <option value="ends">{labels.modeEnds}</option>
        </select>
        <p id={modeHintId} className="text-[10px] text-muted-foreground mt-0.5">
          {value.mode === "ends" ? labels.endsHint : labels.rangeHint}
        </p>
      </div>

      {value.mode === "ends" ? (
        <>
          {timeField("cutStartS", "cut-start", labels.cutStart)}
          {timeField("cutEndS", "cut-end", labels.cutEnd)}
        </>
      ) : (
        <>
          {timeField("startS", "start", labels.start)}
          {timeField("endS", "end", labels.end)}
        </>
      )}

      <div className="space-y-0.5">
        <p
          id={formatHintId}
          className={cn(
            "text-[10px]",
            textValid ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400",
          )}
        >
          {labels.timeFormatHint}
        </p>
        {textValid && problem && (
          <p className="text-[10px] text-amber-700 dark:text-amber-400">
            {labels[PROBLEM_LABEL[problem]]}
          </p>
        )}
      </div>
    </div>
  );
}
