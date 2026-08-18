/**
 * Dev-only time-warp — a first-class dev tool (spec §2, §11 note).
 *
 * The server owns time (spec §14). As of migration 0008 clients can no longer
 * write `trees` directly, so this route drives the guarded SECURITY DEFINER
 * helpers (`dev_warp`, `dev_dry_out`) and `plant_tree` instead. Those helpers
 * only act when `app_config.dev_mode` is true, so the time-warp is inert in
 * production. This route is also 404 outside `NODE_ENV=development`.
 *
 * Usage (dev):
 *   GET  /api/dev/time-warp                          → your trees + render state.
 *   POST { "create": true, ... }                     → plant a quick dev tree.
 *   POST { "days": 8, "treeId"? }                     → age tree(s) by N days.
 *   POST { "dryOutDays": 4, "treeId"? }               → age care so health decays.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeTreeState } from "@/lib/tree/growth";
import type { Tree } from "@/lib/types";

const isDev = process.env.NODE_ENV !== "production";

function notFound() {
  return new NextResponse("Not found", { status: 404 });
}

function withState(tree: Tree) {
  return {
    tree,
    state: computeTreeState(
      { planted_at: tree.planted_at, last_visit_at: tree.last_visit_at, last_watered_at: tree.last_watered_at },
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

  // Plant a quick dev tree via the sanctioned path (fuzzes coords, logs event).
  if (body.create) {
    const { data, error } = await supabase
      .rpc("plant_tree", {
        p_species: body.species_key ?? "maple",
        p_name: body.name ?? "Dev Tree",
        p_lat: body.lat ?? 42.3314,
        p_lng: body.lng ?? -83.0458,
        p_region: "Dev",
      })
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(withState(data as Tree), { status: 201 });
  }

  // Resolve which of the caller's trees to affect.
  let idsQuery = supabase.from("trees").select("id").eq("owner_id", user.id);
  if (body.treeId) idsQuery = idsQuery.eq("id", body.treeId);
  const { data: idRows, error: idErr } = await idsQuery;
  if (idErr) return NextResponse.json({ error: idErr.message }, { status: 500 });
  const ids = (idRows as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) return NextResponse.json({ error: "No matching trees." }, { status: 404 });

  const rpc = body.dryOutDays != null ? "dev_dry_out" : "dev_warp";
  const amount = body.dryOutDays != null ? Number(body.dryOutDays) : Number(body.days);
  if (!Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: "Provide a non-zero `days` or `dryOutDays` (or `create`)." }, { status: 400 });
  }

  const updated: ReturnType<typeof withState>[] = [];
  for (const id of ids) {
    const { data, error } = await supabase.rpc(rpc, { p_tree: id, p_days: amount }).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    updated.push(withState(data as Tree));
  }
  return NextResponse.json({ trees: updated });
}
