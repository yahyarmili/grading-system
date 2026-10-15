import { CircleAlert } from "lucide-react";
import { cloneElement, isValidElement, useId, type ReactElement } from "react";
import { cn } from "cn";

type ControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean;
  required?: boolean;
};

/**
 * Label, control, hint and error message, wired for assistive technology:
 * the control gets an id, aria-describedby (hint + error) and aria-invalid.
 * Required fields say "(required)" in the label, not only with a symbol.
 */
export function FormField({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactElement<ControlProps>;
  className?: string;
}) {
  const autoId = useId();
  const id = (isValidElement(children) && children.props.id) || autoId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  // A control may name more of its own (a counter), kept after the hint and the error.
  const describedBy = [hintId, errorId, children.props["aria-describedby"]].filter(Boolean).join(" ") || undefined;

  const control = cloneElement(children, {
    id,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
    "aria-required": required || undefined,
  });

  return (
    <div className={cn("field", className)}>
      <label className="label" htmlFor={id}>
        {label}
        {required && <span className="font-normal text-fg-muted"> (required)</span>}
      </label>
      {control}
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <span className="sr-only">Error: </span>
            {error}
          </span>
        </p>
      )}
    </div>
  );
}
