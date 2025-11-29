import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  if (!lat || !lon) {
    return NextResponse.json({ error: "lat & lon required" }, { status: 400 });
  }

//   const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
//   url.searchParams.set("latitude", lat);
//   url.searchParams.set("longitude", lon);
//   url.searchParams.set("hourly", "pm10,pm2_5,us_aqi,pollen_tree,pollen_grass,pollen_weed");
//   url.searchParams.set("timezone", "America/Chicago");
//   url.searchParams.set("forecast_days", "1");
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${51.507}&longitude=${0.12}&hourly=pm10,pm2_5,ozone,ragweed_pollen,grass_pollen,alder_pollen,birch_pollen,mugwort_pollen,olive_pollen&forecast_days=1`

  const res = await fetch(url.toString(), { cache: "no-store" });
  console.log("🚀 ~ GET ~ res:", res)
  if (!res.ok) return NextResponse.json(null);
  const json = await res.json();
  return NextResponse.json(json);
}
