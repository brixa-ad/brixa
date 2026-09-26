import { fmt, type Dictionary } from "@/lib/i18n/dictionaries";
import { passkeyProblem } from "@/lib/passkey";

/** What to tell the user when adding a device or signing in with a passkey fails. */
export function passkeyMessage(error: unknown, t: Dictionary, fallback: string) {
  switch (passkeyProblem(error)) {
    case "cancelled":
      return t.passkey.notConfirmed;
    case "wrongDomain":
      return fmt(t.passkey.wrongDomain, { host: location.host });
    case "disabled":
      return t.passkey.notEnabled;
    default:
      return fallback;
  }
}
