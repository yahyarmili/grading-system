import { Alert } from "@/components/alert";
import { rememberedInvite } from "@/server/classes/invite-cookie";

/** A class link was opened before signing in or up (CLS-03 R3): say what happens next. Reads a cookie: behind Suspense. */
export async function InviteNotice({ action }: { action: "sign-in" | "sign-up" }) {
  if (!(await rememberedInvite())) return null;
  return (
    <Alert tone="info" title="Class invitation">
      {action === "sign-in"
        ? "Sign in with your student account: you join the class right after."
        : "Create your account and confirm your email: you join the class then."}
    </Alert>
  );
}
