import { Check } from "lucide-react";
import { cn } from "cn";
import { levelNames, levels, type Level } from "@/lib/rubric";

/**
 * Level 0 to 4 as a radio group (arrow keys move between levels). The AI
 * level is marked under its option, so the gap shows at a glance. Without
 * onChange, read-only: the choice is shown, not changeable.
 */
export function LevelPicker({
  name,
  legend,
  value,
  aiLevel,
  onChange,
}: {
  name: string;
  legend: string;
  value: Level | null;
  aiLevel: Level | null;
  onChange?: (level: Level) => void;
}) {
  const readOnly = !onChange;
  return (
    <fieldset className="flex flex-col gap-1.5" disabled={readOnly}>
      <legend className="label mb-1.5">{legend}</legend>
      <div className="grid grid-cols-5 gap-1.5">
        {levels.map((level) => {
          const checked = value === level;
          return (
            <label key={level} className="flex flex-col items-center gap-0.5">
              <span
                className={cn(
                  "relative flex h-10 w-full items-center justify-center rounded-lg border text-base font-semibold tabular-nums transition-colors",
                  "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus",
                  !readOnly && "cursor-pointer",
                  checked
                    ? "border-primary bg-primary text-fg-on-primary"
                    : cn("border-border-control bg-surface", readOnly ? "text-fg-muted" : "hover:border-primary-hover"),
                )}
              >
                <input
                  type="radio"
                  name={name}
                  value={level}
                  checked={checked}
                  onChange={onChange && (() => onChange(level))}
                  readOnly={readOnly}
                  className="sr-only"
                />
                {checked && <Check aria-hidden="true" className="absolute top-1 right-1 size-3" />}
                {level}
                <span className="sr-only">
                  {" "}
                  – {levelNames[level]}
                  {level === aiLevel ? ", AI proposal" : ""}
                </span>
              </span>
              <span aria-hidden="true" className="h-4 text-[0.6875rem] leading-4 text-fg-muted">
                {level === aiLevel ? "AI" : ""}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
