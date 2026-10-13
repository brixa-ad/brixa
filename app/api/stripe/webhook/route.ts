import { anonymous } from "@/lib/share";

/**
 * Stripe tells BRIXA about payments here (paid, failed, renewal on or off). The database checks
 * Stripe's signature with the secret saved in /admin and applies each event once (066) — this
 * route only passes the raw body and the signature along.
 */
export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";
  const { data, error } = await anonymous().rpc("stripe_webhook", { payload, signature });
  if (error) {
    console.error("Stripe webhook failed:", error.message);
    return new Response(null, { status: 500 });
  }
  // Stripe tries again later on anything but 2xx
  if (data === "bad_signature") return new Response("Bad signature", { status: 400 });
  if (data === "not_configured") return new Response("Not configured", { status: 503 });
  return Response.json({ received: true, result: data });
}
