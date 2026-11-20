import { useEffect, useRef, useState } from "react";
import { formatTimecode, parseTimecode } from "@/lib/timecode";
import { cn } from "@/lib/utils";

interface TimecodeInputProps {
  id: string;
  value: number;
  onChange: (seconds: number) => void;
  /** Reports whether the text currently in the field parses. */
  onValidityChange?: (valid: boolean) => void;
  describedBy?: string;
}

/**
 * Text field for a time in seconds that also takes MM:SS and HH:MM:SS. The
 * typed text is kept as-is while it is being edited and normalised on blur.
 */
export function TimecodeInput({
  id,
  value,
  onChange,
  onValidityChange,
  describedBy,
}: TimecodeInputProps) {
  const [text, setText] = useState(() => formatTimecode(value));
  const valid = parseTimecode(text) !== null;

  // Follow outside changes (initial settings arriving later) without
  // clobbering an equivalent value the user is mid-way through typing.
  useEffect(() => {
    setText((current) => (parseTimecode(current) === value ? current : formatTimecode(value)));
  }, [value]);

  const onValidityChangeRef = useRef(onValidityChange);
  useEffect(() => {
    onValidityChangeRef.current = onValidityChange;
  });
  useEffect(() => {
    onValidityChangeRef.current?.(valid);
  }, [valid]);

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      placeholder="0:00"
      value={text}
      aria-invalid={!valid}
      aria-describedby={describedBy}
      onChange={(e) => {
        setText(e.target.value);
        const parsed = parseTimecode(e.target.value);
        if (parsed !== null) onChange(parsed);
      }}
      // Unparseable text falls back to the last good value rather than
      // leaving a red field whose number silently differs from what it shows.
      onBlur={() => setText(formatTimecode(value))}
      className={cn(
        "w-full mt-0.5 px-2 py-1.5 rounded border bg-background text-sm text-foreground tabular-nums",
        valid ? "border-border" : "border-destructive",
      )}
    />
  );
}
