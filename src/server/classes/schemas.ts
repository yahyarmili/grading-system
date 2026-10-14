import { z } from "zod";
import { CLASS_NAME_MAX_LENGTH } from "@/config/provisional";

// Server-side validation of class inputs (CLS-01).

/** Trimmed, inner spaces collapsed: "Grade  10 " and "Grade 10" are one name. */
export const classNameSchema = z
  .string({ error: "Enter a class name." })
  .transform((name) => name.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1, { error: "Enter a class name." })
      .max(CLASS_NAME_MAX_LENGTH, { error: `Use at most ${CLASS_NAME_MAX_LENGTH} characters.` }),
  );

export const createClassSchema = z.object({ name: classNameSchema });
