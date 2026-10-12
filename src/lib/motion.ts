import { gsap } from "gsap";

/**
 * GSAP is reserved for micro-interactions (press feedback, a value changing,
 * an item appearing). Page transitions and decorative animation are out of scope.
 * Every animation goes through motionSafe so it never runs when the user
 * asks for reduced motion.
 */
export const MOTION = {
  fast: 0.12,
  base: 0.2,
  ease: "power2.out",
} as const;

const NO_PREFERENCE = "(prefers-reduced-motion: no-preference)";

/**
 * Runs `setup` only when reduced motion is not requested, and re-evaluates
 * if the preference changes. Returns a cleanup that reverts every tween
 * created inside `setup`. Call it from an effect in a client component.
 */
export function motionSafe(
  setup: () => void | (() => void),
  scope?: Element | string,
): () => void {
  const mm = gsap.matchMedia(scope);
  mm.add(NO_PREFERENCE, setup);
  return () => mm.revert();
}

/** Short scale-down on pointer press, for buttons and clickable cards. */
export function pressFeedback(element: HTMLElement): () => void {
  return motionSafe(() => {
    const down = () =>
      gsap.to(element, { scale: 0.97, duration: MOTION.fast, ease: MOTION.ease });
    const up = () =>
      gsap.to(element, { scale: 1, duration: MOTION.base, ease: MOTION.ease });
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointerup", up);
    element.addEventListener("pointerleave", up);
    return () => {
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointerleave", up);
    };
  });
}
