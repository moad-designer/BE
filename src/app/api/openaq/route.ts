import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  const radius = searchParams.get("radius") ?? "50000"; // 50km
  if (!lat || !lon) {
    return NextResponse.json({ error: "lat & lon required" }, { status: 400 });
  }

  const url = new URL("https://api.openaq.org/v3/measurements");
  url.searchParams.set("coordinates", `${lat},${lon}`);
  url.searchParams.set("radius", radius);
  url.searchParams.set("parameters", "pm25,pm10,o3");
  url.searchParams.set("limit", "200");
  url.searchParams.set("order_by", "datetime");
  url.searchParams.set("sort", "desc");
  url.searchParams.set("date_from", new Date(Date.now() - 24 * 3600 * 1000).toISOString());

  const res = await fetch(url.toString(), { cache: "no-store", headers: {"X-API-Key": process.env.OPEN_AQ_API_KEY ?? ""}});
  if (!res.ok) return NextResponse.json({ results: [] });
  const json = await res.json();
  return NextResponse.json(json);
}
