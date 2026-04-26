import type { SupabaseClient } from "@supabase/supabase-js";
import { applyMandantFilter } from "@/lib/mandantScope";

export type LocationEmbed = {
  id: string;
  name: string;
  address: string | null;
} | null;

export type MachineWithLocationRow = {
  id: string;
  name: string | null;
  serial_number: string;
  status: string;
  last_ai_report: string | null;
  last_ai_report_at: string | null;
  company_id: string;
  location_id: string | null;
  locations: LocationEmbed;
};

type MachineRowRaw = {
  id: string;
  name: string | null;
  serial_number: string;
  status: string;
  last_ai_report: string | null;
  last_ai_report_at: string | null;
  company_id: string;
  location_id?: string | null;
};

const SEL_FULL =
  "id,name,serial_number,status,last_ai_report,last_ai_report_at,company_id,location_id";

const SEL_NO_REPORT = "id,name,serial_number,status,company_id,location_id";

const SEL_NO_LOC_REPORT =
  "id,name,serial_number,status,last_ai_report,last_ai_report_at,company_id";

const SEL_NO_LOC = "id,name,serial_number,status,company_id";

async function attachLocationsByIds(
  service: SupabaseClient,
  machines: MachineRowRaw[],
): Promise<MachineWithLocationRow[]> {
  const ids = [
    ...new Set(
      machines
        .map((m) => m.location_id)
        .filter((x): x is string => typeof x === "string" && x.length > 0),
    ),
  ];
  const locById = new Map<string, LocationEmbed>();
  if (ids.length > 0) {
    const { data: locRows, error: locErr } = await service
      .from("locations")
      .select("id,name,address")
      .in("id", ids);
    if (!locErr) {
      for (const l of locRows ?? []) {
        const row = l as {
          id: string;
          name: string;
          address: string | null;
        };
        locById.set(row.id, {
          id: row.id,
          name: row.name,
          address: row.address,
        });
      }
    }
  }

  return machines.map((m) => ({
    ...m,
    location_id: m.location_id ?? null,
    locations: m.location_id ? locById.get(m.location_id) ?? null : null,
  }));
}

/**
 * Maschinen inkl. Standorte: keine PostgREST-Embed-Joins mehr für locations
 * (vermeidet location_id / FK-Probleme) — zweite Abfrage auf locations.
 */
export async function fetchMachinesWithLocations(
  service: SupabaseClient,
  opts: { tenantId: string | null; isAdmin: boolean },
): Promise<{
  machines: MachineWithLocationRow[];
  error: { message: string } | null;
}> {
  const base = (select: string) => {
    let q = service
      .from("machines")
      .select(select)
      .order("name", { ascending: true, nullsFirst: false });
    if (!opts.isAdmin && opts.tenantId) {
      q = applyMandantFilter(q, opts.tenantId);
    }
    return q;
  };

  let res = await base(SEL_FULL);

  if (res.error?.message.includes("last_ai_report")) {
    res = await base(SEL_NO_REPORT);
    if (res.error) {
      return { machines: [], error: res.error };
    }
    const list = (res.data ?? []) as unknown as MachineRowRaw[];
    return {
      machines: await attachLocationsByIds(service, list),
      error: null,
    };
  }

  if (res.error?.message.includes("location_id")) {
    res = await base(SEL_NO_LOC_REPORT);
    if (res.error?.message.includes("last_ai_report")) {
      res = await base(SEL_NO_LOC);
    }
    if (res.error) {
      return { machines: [], error: res.error };
    }
    const list = (res.data ?? []) as unknown as MachineRowRaw[];
    return {
      machines: list.map((m) => ({
        ...m,
        location_id: null,
        locations: null,
      })),
      error: null,
    };
  }

  if (res.error) {
    return { machines: [], error: res.error };
  }

  const list = (res.data ?? []) as unknown as MachineRowRaw[];
  return {
    machines: await attachLocationsByIds(service, list),
    error: null,
  };
}
