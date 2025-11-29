import { NextResponse } from "next/server";

const API = process.env.AIRNOW_API_KEY;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  const distance = searchParams.get("distance") ?? "50"; // miles
  if (!lat || !lon) {
    return NextResponse.json({ error: "lat & lon required" }, { status: 400 });
  }
  if (!API) {
    return NextResponse.json({ error: "AIRNOW_API_KEY not set" }, { status: 500 });
  }

  const obsUrl = new URL("https://www.airnowapi.org/aq/observation/latLong/current/");
  obsUrl.searchParams.set("format", "application/json");
  obsUrl.searchParams.set("latitude", lat);
  obsUrl.searchParams.set("longitude", lon);
  obsUrl.searchParams.set("distance", distance);
  obsUrl.searchParams.set("API_KEY", API);

  const fcUrl = new URL("https://www.airnowapi.org/aq/forecast/latLong/");
  fcUrl.searchParams.set("format", "application/json");
  fcUrl.searchParams.set("latitude", lat);
  fcUrl.searchParams.set("longitude", lon);
  fcUrl.searchParams.set("distance", distance);
  fcUrl.searchParams.set("API_KEY", API);

  const [obsRes, fcRes] = await Promise.allSettled([
    fetch(obsUrl.toString(), { cache: "no-store" }),
    fetch(fcUrl.toString(), { cache: "no-store" }),
  ]);

  const observations =
    obsRes.status === "fulfilled" && obsRes.value.ok ? await obsRes.value.json() : [];
  const forecast =
    fcRes.status === "fulfilled" && fcRes.value.ok ? await fcRes.value.json() : [];
    // console.log(observations)
  return NextResponse.json({ observations, forecast });
}
