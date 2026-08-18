/**
 * Minimal, privacy-safe funnel instrumentation (spec §17.10). Best-effort and
 * fire-and-forget — analytics must never block or break the app, so failures are
 * swallowed. No PII: event names + small metadata only. Analysis lives in
 * docs/METRICS.md; most retention/conversion comes from the gameplay tables and
 * only the pre-auth funnel bits go through here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type AnalyticsEvent =
  | "welcome_viewed"
  | "guest_started"
  | "tree_planted"
  | "gate_signup_opened"
  | "signup_completed";

export function track(
  supabase: SupabaseClient,
  event: AnalyticsEvent,
  uid: string | null = null,
  meta?: Record<string, unknown>,
): void {
  // Deliberately not awaited; ignore any error.
  void supabase
    .from("analytics_events")
    .insert({ event, user_id: uid, meta: meta ?? null })
    .then(
      () => {},
      () => {},
    );
}
