import { createClient } from "@/lib/supabase";

interface ReservationRow {
  id: string;
  sector_id: string;
  arrival_at: string;
  departure_at: string;
  status: string;
}

export interface ConflictInfo {
  sectorName: string;
  currentSpotCount: number;
  proposedSpotCount: number;
  activeReservations: number;
  reason: string;
}

export async function getPeakConcurrentReservations(
  supabaseClient: ReturnType<typeof createClient>,
  sectorId: string,
  timeRange?: { start: Date; end: Date }
): Promise<number> {
  if (!supabaseClient) {
    throw new Error("Supabase client not initialized");
  }

  const now = new Date();
  const startTime = timeRange?.start ?? now;

  const { data: reservations, error } = await supabaseClient
    .from("reservations")
    .select("id, sector_id, arrival_at, departure_at, status")
    .eq("sector_id", sectorId)
    .in("status", ["confirmed", "arrived"])
    .gte("departure_at", startTime.toISOString());

  if (error) {
    throw new Error(`Failed to query reservations: ${error.message}`);
  }

  if (!reservations) {
    return 0;
  }

  if (reservations.length === 0) {
    return 0;
  }

  // Calculate peak concurrent reservations
  // Sort all events (arrivals and departures) chronologically.
  // On ties (same timestamp), departures sort before arrivals
  // to treat departures as exclusive: [arrival, departure).
  const events: { time: Date; type: "arrival" | "departure" }[] = [];

  for (const res of reservations as unknown as ReservationRow[]) {
    events.push({ time: new Date(res.arrival_at), type: "arrival" });
    events.push({ time: new Date(res.departure_at), type: "departure" });
  }

  events.sort((a, b) => {
    const timeDiff = a.time.getTime() - b.time.getTime();
    if (timeDiff !== 0) return timeDiff;
    // On time tie, departures sort before arrivals
    return a.type === "departure" ? -1 : 1;
  });

  let currentCount = 0;
  let peakCount = 0;

  for (const event of events) {
    if (event.type === "arrival") {
      currentCount += 1;
    } else {
      currentCount -= 1;
    }
    peakCount = Math.max(peakCount, currentCount);
  }

  return peakCount;
}

export async function checkSectorConflict(
  supabaseClient: ReturnType<typeof createClient>,
  sectorId: string,
  newSpotCount: number
): Promise<ConflictInfo | null> {
  if (!supabaseClient) {
    throw new Error("Supabase client not initialized");
  }

  // Get current sector info
  const { data: sector, error: sectorError } = await supabaseClient
    .from("sectors")
    .select("id, name, spot_count")
    .eq("id", sectorId)
    .single();

  if (sectorError) {
    throw new Error(`Failed to fetch sector: ${sectorError.message}`);
  }

  if (!sector) {
    throw new Error(`Sector with id ${sectorId} not found`);
  }

  // Get peak concurrent reservations
  const peakConcurrent = await getPeakConcurrentReservations(supabaseClient, sectorId);

  // Check if reduction would create conflict
  if (newSpotCount < peakConcurrent) {
    return {
      sectorName: sector.name as string,
      currentSpotCount: sector.spot_count as number,
      proposedSpotCount: newSpotCount,
      activeReservations: peakConcurrent,
      reason: `Proposed spot count (${newSpotCount}) is less than peak concurrent reservations (${peakConcurrent})`,
    };
  }

  return null;
}
