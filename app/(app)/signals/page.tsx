import { redirect } from "next/navigation";

/** The signals moved into Follow-up (old links still work). */
export default async function SignalsPage({ searchParams }: PageProps<"/signals">) {
  const { broker } = await searchParams;
  redirect(`/follow-up?view=signals${typeof broker === "string" ? `&broker=${encodeURIComponent(broker)}` : ""}`);
}
