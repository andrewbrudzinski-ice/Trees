/**
 * Dev-only time-warp — a first-class dev tool (spec §2, §11 note).
 *
 * The server owns time (spec §14): every derivation uses the real server clock,
 * and client-supplied timestamps are ignored. So the honest way to "warp time"
 * is to move a tree's `planted_at` (and its care timestamps) *backwards in real
 * time* — making the tree genuinely older against the same server now. That
 * lets us exercise the 7-day growth loop and health decay in seconds without
 * faking the clock or trusting anything from the client.
 *
 * This route is compiled in every build but REFUSES to run outside development
 * (returns 404 in production), and it only ever touches the caller's own trees
 * (RLS scopes every query to `auth.uid()`).
 *
 * Usage (dev):
 *   GET  /api/dev/time-warp
 *        → list your trees with their derived render state.
 *   POST /api/dev/time-warp { "create": true, "species_key"?, "name"?, "lat"?, "lng"? }
 *        → plant a quick dev tree (Step 4 has the real plant flow; this is a stub).
 *   POST /api/dev/time-warp { "days": 8, "treeId"? }
 *        → age the tree(s) by N days (negative = younger). Shifts care timestamps
 *          by the same delta so relative health is preserved.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeTreeState, DAY_MS } from "@/lib/tree/growth";
import type { Tree } from "@/lib/types";

const isDev = process.env.NODE_ENV !== "production";

function notFound() {
  // Behave as if the route does not exist outside development.
  return new NextResponse("Not found", { status: 404 });
}

/** Attach derived render state (age/stage/growth/ageFactor/health) to a tree. */
function withState(tree: Tree) {
  return {
    tree,
    state: computeTreeState(
      {
        planted_at: tree.planted_at,
        last_visit_at: tree.last_visit_at,
        last_watered_at: tree.last_watered_at,
      },
      Date.now(),
    ),
  };
}

export async function GET() {
  if (!isDev) return notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase
    .from("trees")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ trees: (data as Tree[]).map(withState) });
}

export async function POST(request: Request) {
  if (!isDev) return notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    create?: boolean;
    species_key?: string;
    name?: string;
    lat?: number;
    lng?: number;
    days?: number;
    dryOutDays?: number;
    treeId?: string;
  };

  // --- Plant a quick dev tree ------------------------------------------------
  if (body.create) {
    const insert = {
      owner_id: user.id,
      species_key: body.species_key ?? "maple",
      name: body.name ?? "Dev Tree",
      visual_seed: Math.floor(Math.random() * 1_000_000),
      lat: body.lat ?? 42.3314,
      lng: body.lng ?? -83.0458, // Detroit, matching the prototype's default region
      region_label: "Dev",
    };
    const { data, error } = await supabase.from("trees").insert(insert).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const tree = data as Tree;
    await supabase.from("tree_events").insert({
      tree_id: tree.id,
      kind: "planted",
      meta: { via: "dev/time-warp" },
    });
    return NextResponse.json(withState(tree), { status: 201 });
  }

  // --- Dry out: age the care timestamps so health decays (to demo watering) --
  if (body.dryOutDays != null) {
    const dryDays = Number(body.dryOutDays);
    if (!Number.isFinite(dryDays) || dryDays <= 0) {
      return NextResponse.json({ error: "`dryOutDays` must be a positive number." }, { status: 400 });
    }
    const stale = new Date(Date.now() - dryDays * DAY_MS).toISOString();
    let dq = supabase.from("trees").update({ last_watered_at: stale, last_visit_at: stale }).eq("owner_id", user.id);
    if (body.treeId) dq = dq.eq("id", body.treeId);
    const { data: dried, error: dErr } = await dq.select("*");
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 400 });
    return NextResponse.json({ driedDays: dryDays, trees: (dried as Tree[]).map(withState) });
  }

  // --- Warp time by moving planted_at (and care) backwards -------------------
  const days = Number(body.days);
  if (!Number.isFinite(days) || days === 0) {
    return NextResponse.json(
      { error: "Provide a non-zero numeric `days` (or `create: true`)." },
      { status: 400 },
    );
  }
  const deltaMs = days * DAY_MS;

  let query = supabase.from("trees").select("*").eq("owner_id", user.id);
  if (body.treeId) query = query.eq("id", body.treeId);
  const { data: rows, error: readErr } = await query;
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "No matching trees to warp." }, { status: 404 });
  }

  const shift = (iso: string | null) =>
    iso == null ? null : new Date(new Date(iso).getTime() - deltaMs).toISOString();

  const updated: ReturnType<typeof withState>[] = [];
  for (const row of rows as Tree[]) {
    const nextPlanted = new Date(new Date(row.planted_at).getTime() - deltaMs).toISOString();
    const patch = {
      planted_at: nextPlanted,
      last_visit_at: shift(row.last_visit_at),
      last_watered_at: shift(row.last_watered_at),
    };
    const { data: saved, error: updErr } = await supabase
      .from("trees")
      .update(patch)
      .eq("id", row.id)
      .select("*")
      .single();
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });
    updated.push(withState(saved as Tree));
  }

  return NextResponse.json({ warpedDays: days, trees: updated });
}
