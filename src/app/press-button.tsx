"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import { pressFeedback } from "@/lib/motion";

/** Temporary: demonstrates the GSAP press feedback on the foundations preview. */
export function PressButton(props: ComponentProps<"button">) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    return pressFeedback(ref.current);
  }, []);

  return <button ref={ref} {...props} />;
}
