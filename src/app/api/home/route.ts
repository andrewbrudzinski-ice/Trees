/**
 * GET /api/home — the server-authoritative render state for the signed-in user.
 *
 * The client requests render state; it never computes age/stage/health itself
 * (spec §9). Here the server derives every tree's state from its timestamps
 * against the server clock, and returns the profile (with its ledger-backed
 * seed balance) and whether the user has checked in today. The browser only
 * draws the SVG from these numbers.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeTreeState } from "@/lib/tree/growth";
import type { Profile, Tree } from "@/lib/types";

export async function GET() {
  try {
    return await home();
  } catch (e) {
    // Never 500 the render-state route — degrade to "not signed in" and surface
    // a short diagnostic so a misconfigured deploy is debuggable, not a brick.
    return NextResponse.json(
      { authed: false, diag: (e as Error)?.message ?? String(e) },
      { status: 200 },
    );
  }
}

async function home() {
  const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!hasUrl || !hasKey) {
    return NextResponse.json({ authed: false, diag: "env-missing", hasUrl, hasKey }, { status: 200 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ authed: false }, { status: 200 });

  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10); // UTC date, matches check_in()

  const [{ data: profile }, { data: trees }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("trees").select("*").eq("owner_id", user.id).order("planted_at", { ascending: true }),
  ]);

  const withState = (t: Tree) => ({
    tree: t,
    state: computeTreeState(
      { planted_at: t.planted_at, last_visit_at: t.last_visit_at, last_watered_at: t.last_watered_at },
      now,
    ),
  });

  return NextResponse.json({
    authed: true,
    profile: (profile as Profile) ?? null,
    trees: ((trees as Tree[]) ?? []).map(withState),
    today,
    checkedInToday: (profile as Profile | null)?.last_checkin_date === today,
  });
}
