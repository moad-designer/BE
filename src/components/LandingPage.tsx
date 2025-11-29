"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import PollenCard from "./PollenCard";
import AirQualityMap, { CountyMarker } from "./AirQualityMap";

/* ============================= *
 *            Types              *
 * ============================= */
interface Coordinates {
  lat: number;
  lon: number;
}

interface PollutantData {
  aqi: number | null;
  value: number | null;
  unit: string;
  category: string;
}

interface ForecastDay {
  date: string;
  dayName: string;
  overallAQI: number;
  category: string;
  primaryPollutant: string;
}

interface AirQualitySummary {
  updatedAt: string;
  hasData: boolean;
  dataSource: string;
  coordinates?: { lat: number; lon: number }; // For debugging
  overallAQI: number;
  forecast?: ForecastDay[]; // 5-day forecast
  pollutants: {
    o3: PollutantData;
    pm25: PollutantData;
    pm10: PollutantData;
  };
  pollen: {
    tree: number;
    grass: number;
    weed: number;
    source: string;
  };
}

interface StatTileProps {
  title: string;
  value: string | number;
  sub?: string;
  badgeText?: string;
  aqi?: number | null;
}

interface PollenBarProps {
  label: string;
  value: number;
}

/* ================================= *
 *      Central Time clock hook      *
 * ================================= */
function useCentralClock() {
  const [now, setNow] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setNow(new Date()); // only after hydration
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const parts = useMemo(() => {
    if (!mounted || !now) {
      return { dateStr: "Loading...", timeStr: "Loading...", weekday: "Loading..." };
    }
    const d = new Date(
      now.toLocaleString("en-US", { timeZone: "America/Chicago" })
    );
    const dateStr = d.toDateString();
    const timeStr = d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
    const weekday = d.toLocaleString("en-US", { weekday: "long" });
    return { dateStr, timeStr, weekday };
  }, [now, mounted]);

  return parts;
}

/* ======================================= *
 * Visit counters (local-only placeholder) *
 * ======================================= */
function useVisitCounters() {
  const [total, setTotal] = useState(0);
  const [today, setToday] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const ls = typeof window !== "undefined" ? window.localStorage : null;
    if (!ls) return;

    // keep "today" in CT to avoid date rollovers by TZ
    const todayKey = new Date().toLocaleString("en-CA", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).replace(/\//g, "-");

    const totalKey = "beh_visits_total";
    const dayKey = `beh_visits_${todayKey}`;
    const sessionKey = "beh_session_mark";

    const increment = () => {
      const t = parseInt(ls.getItem(totalKey) || "0", 10) + 1;
      const d = parseInt(ls.getItem(dayKey) || "0", 10) + 1;
      ls.setItem(totalKey, String(t));
      ls.setItem(dayKey, String(d));
      setTotal(t);
      setToday(d);
    };

    if (!ls.getItem(sessionKey)) {
      ls.setItem(sessionKey, "1");
      increment();
    } else {
      setTotal(parseInt(ls.getItem(totalKey) || "0", 10));
      setToday(parseInt(ls.getItem(dayKey) || "0", 10));
    }
  }, []);

  return { total, today };
}

/* ============================= *
 *        Safe fetch helper      *
 * ============================= */
async function safeFetch(url: string, timeout = 12000): Promise<any> {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      mode: "cors",
      cache: "no-cache",
      headers: { Accept: "application/json" },
    });
    clearTimeout(to);
    if (!res.ok) {
      console.warn(`API ${url} -> ${res.status} ${res.statusText}`);
      return null;
    }
    return await res.json();
  } catch (err: any) {
    clearTimeout(to);
    if (err?.name === "AbortError") {
      console.warn(`Fetch abort (timeout) for ${url}`);
    } else {
      console.warn(`Fetch error for ${url}:`, err?.message || err);
    }
    return null;
  }
}

/* ============================= *
 *     External data fetchers    *
 * ============================= */
async function fetchOpenAQLatest({
  lat,
  lon,
  radiusMeters = 50000,
}: Coordinates & { radiusMeters?: number }) {
  const url = new URL("/api/openaq", window.location.origin);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("radius", String(radiusMeters));
  return (await safeFetch(url.toString()))?.results || [];
}

async function fetchOpenMeteoPollen({ lat, lon }: Coordinates) {
  const url = new URL("/api/openmeteo", window.location.origin);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  return await safeFetch(url.toString());
}

// Fallback: Open-Meteo air quality (no API key required)
async function fetchOpenMeteoAirQuality({ lat, lon }: Coordinates) {
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm10,pm2_5,ozone&hourly=us_aqi,pm10,pm2_5,ozone&timezone=America%2FChicago&forecast_days=7`;
  return await safeFetch(url);
}

// Open-Meteo air quality forecast (5 days)
async function fetchOpenMeteoAirQualityForecast({ lat, lon }: Coordinates) {
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&daily=us_aqi_max,pm10_max,pm2_5_max,ozone_max&timezone=America%2FChicago&forecast_days=5`;
  return await safeFetch(url);
}

// AirNow (preferred AQI + concentrations). distance in miles.
async function fetchAirNow({
  lat,
  lon,
  distance = 50,
}: Coordinates & { distance?: number }) {
  const url = new URL("/api/airnow", window.location.origin);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("distance", String(distance));
  const json = await safeFetch(url.toString());
  return json || { observations: [], forecast: [] };
}

/* ============================= *
 *           AQI helpers         *
 * ============================= */
const BREAKPOINTS: Record<
  string,
  { Cl: number; Ch: number; Il: number; Ih: number }[]
> = {
  pm25: [
    { Cl: 0.0, Ch: 12.0, Il: 0, Ih: 50 },
    { Cl: 12.1, Ch: 35.4, Il: 51, Ih: 100 },
    { Cl: 35.5, Ch: 55.4, Il: 101, Ih: 150 },
    { Cl: 55.5, Ch: 150.4, Il: 151, Ih: 200 },
    { Cl: 150.5, Ch: 250.4, Il: 201, Ih: 300 },
    { Cl: 250.5, Ch: 500.4, Il: 301, Ih: 500 },
  ],
  pm10: [
    { Cl: 0, Ch: 54, Il: 0, Ih: 50 },
    { Cl: 55, Ch: 154, Il: 51, Ih: 100 },
    { Cl: 155, Ch: 254, Il: 101, Ih: 150 },
    { Cl: 255, Ch: 354, Il: 151, Ih: 200 },
    { Cl: 355, Ch: 424, Il: 201, Ih: 300 },
    { Cl: 425, Ch: 604, Il: 301, Ih: 500 },
  ],
};

function calcAQI(pollutant: string, C: number | null): number | null {
  if (C == null) return null;
  const bps = BREAKPOINTS[pollutant];
  if (!bps) return null;
  let bp = bps.find((b) => C >= b.Cl && C <= b.Ch);
  if (!bp && C > bps[bps.length - 1].Ch) bp = bps[bps.length - 1];
  if (!bp && C < bps[0].Cl) bp = bps[0];
  if (!bp) return null;
  const { Cl, Ch, Il, Ih } = bp;
  const aqi = ((Ih - Il) / (Ch - Cl)) * (C - Cl) + Il;
  return Math.round(aqi);
}

function aqiCategory(aqi: number | null): string {
  if (aqi == null) return "Unknown";
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Unhealthy for SG";
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very Unhealthy";
  return "Hazardous";
}

/* ===================================================== *
 *    Helpers to compute OpenAQ recent median values     *
 * ===================================================== */
function medianFromOpenAQ(
  openaqResults: any[],
  param: "pm25" | "pm10" | "o3"
): number | null {
  const vals = openaqResults
    .filter(
      (r) =>
        r?.parameter === param &&
        typeof r?.value === "number" &&
        new Date(r?.datetime).getTime() > Date.now() - 3 * 3600 * 1000
    )
    .map((r) => r.value)
    .sort((a: number, b: number) => a - b);

  if (!vals.length) return null;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
}

/* ============================= *
 *            UI bits            *
 * ============================= */
function aqiColor(aqi: number | null): string {
  if (aqi == null) return "bg-gray-300";
  if (aqi <= 50) return "bg-emerald-500";
  if (aqi <= 100) return "bg-yellow-400";
  if (aqi <= 150) return "bg-orange-500";
  if (aqi <= 200) return "bg-red-500";
  if (aqi <= 300) return "bg-fuchsia-600";
  return "bg-rose-800";
}

function StatTile({ title, value, sub, badgeText, aqi }: StatTileProps) {
  return (
    <div className="group rounded-3xl shadow-lg border border-white/50 bg-white/80 backdrop-blur-sm p-6 flex flex-col gap-3 hover:shadow-xl hover:bg-white/90 transition-all duration-300">
      <div className="text-sm font-medium text-gray-600 uppercase tracking-wide">{title}</div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-4xl font-bold leading-none bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
            {value === null || value === undefined || value === "" ? "--" : value}
          </div>
          {sub && <div className="text-sm text-gray-500 mt-2 leading-tight">{sub}</div>}
        </div>
        {typeof aqi === "number" && aqi >= 0 ? (
          <span
            className={`inline-flex items-center px-4 py-2 rounded-full text-white text-sm font-semibold shadow-md ${aqiColor(
              aqi
            )}`}
          >
            AQI {aqi}
          </span>
        ) : badgeText ? (
          <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 text-sm font-medium">
            {badgeText}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function PollenBar({ label, value }: PollenBarProps) {
  const width = `${(Math.min(5, Math.max(0, value)) / 5) * 100}%`;
  const barColor = value > 0 ? "bg-green-500" : "bg-gray-400";
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-sm text-gray-600">{label}</span>
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full`} style={{ width }} />
      </div>
      <span className="w-6 text-right text-sm text-gray-700">{value}</span>
    </div>
  );
}

/* ============================= *
 *         Main component        *
 * ============================= */
export default function LandingPage() {
  const [county, setCounty] = useState("Harris County");
  const [coords, setCoords] = useState<Coordinates>({ lat: 29.7604, lon: -95.3698 });
  const [summary, setSummary] = useState<AirQualitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allCountyMarkers, setAllCountyMarkers] = useState<CountyMarker[]>([]);
  const { dateStr, timeStr, weekday } = useCentralClock();
  const { total, today } = useVisitCounters();

  const countyCenters: Record<string, Coordinates> = {
    "Harris County": { lat: 29.7752, lon: -95.3103 },
    "Fort Bend County": { lat: 29.5261, lon: -95.7776 },
    "Montgomery County": { lat: 30.3213, lon: -95.4778 },
    "Brazoria County": { lat: 29.172, lon: -95.4342 },
    "Galveston County": { lat: 29.3839, lon: -94.9027 },
    "Waller County": { lat: 29.9674, lon: -96.064 },
    "Liberty County": { lat: 30.151, lon: -94.8106 },
    "Chambers County": { lat: 29.7055, lon: -94.686 },
  };

  // ---------- fetch & assemble ----------
  const loadData = useCallback(async (center: Coordinates, countyName?: string) => {
    console.log(`Loading data for coordinates: ${center.lat}, ${center.lon}`);
    setLoading(true);
    setError(null);
    try {
      const [openaqResults, openMeteo, airNow, openMeteoAQ, forecastData] = await Promise.all([
        fetchOpenAQLatest({ lat: center.lat, lon: center.lon }),
        fetchOpenMeteoPollen({ lat: center.lat, lon: center.lon }),
        fetchAirNow({ lat: center.lat, lon: center.lon, distance: 50 }),
        fetchOpenMeteoAirQuality({ lat: center.lat, lon: center.lon }),
        fetchOpenMeteoAirQualityForecast({ lat: center.lat, lon: center.lon }),
      ]);
      
      console.log('API Responses:', {
        openaqCount: openaqResults?.length || 0,
        openMeteoData: !!openMeteo,
        airNowObservations: airNow?.observations?.length || 0,
        airNowHasError: airNow?.error,
        openMeteoAQData: !!openMeteoAQ?.current,
        openMeteoAQDaily: !!openMeteoAQ?.daily
      });

      const getObs = (name: string) =>
        Array.isArray(airNow?.observations)
          ? airNow.observations.find(
              (o: any) => o?.ParameterName?.toLowerCase() === name
            )
          : null;

      const o3Obs = getObs("o3");
      const pm25Obs = getObs("pm2.5");
      const pm10Obs = getObs("pm10");
      // concentrations (AirNow first, then OpenAQ median)
      const pm25ValOAQ = medianFromOpenAQ(openaqResults, "pm25");
      const pm10ValOAQ = medianFromOpenAQ(openaqResults, "pm10");
      const o3ValOAQ = medianFromOpenAQ(openaqResults, "o3");
      // Use Open-Meteo as fallback when other APIs fail
      const openMeteoFallback = openMeteoAQ?.current;
      
      let pm25Val =
        typeof pm25Obs?.Concentration === "number"
          ? pm25Obs.Concentration
          : pm25ValOAQ || openMeteoFallback?.pm2_5;
      let pm10Val =
        typeof pm10Obs?.Concentration === "number"
          ? pm10Obs.Concentration
          : pm10ValOAQ || openMeteoFallback?.pm10;
      let o3Val =(
        typeof o3Obs?.Concentration === "number" ? o3Obs.Concentration : o3ValOAQ) || 
        o3Obs?.AQI || openMeteoFallback?.ozone;
      
      console.log('Processed pollutant values:', {
        pm25: { airNow: pm25Obs?.Concentration, openAQ: pm25ValOAQ, openMeteo: openMeteoFallback?.pm2_5, final: pm25Val },
        pm10: { airNow: pm10Obs?.Concentration, openAQ: pm10ValOAQ, openMeteo: openMeteoFallback?.pm10, final: pm10Val },
        o3: { airNow: o3Obs?.Concentration, openAQ: o3ValOAQ, openMeteo: openMeteoFallback?.ozone, final: o3Val }
      });

      const pm25Unit = pm25Obs?.Unit || "µg/m³";
      const pm10Unit = pm10Obs?.Unit || "µg/m³";
      const o3Unit = o3Obs?.Unit || "(varies)";

      // ---------- FINAL FALLBACK to Open-Meteo model (PM only) ----------
      // Use the latest index from the returned hourly arrays.
      const omTimes: string[] = openMeteo?.hourly?.time || [];
      const lastIdx = omTimes.length ? omTimes.length - 1 : -1;

      if (pm25Val == null && lastIdx >= 0 && Array.isArray(openMeteo?.hourly?.pm2_5)) {
        const m = openMeteo.hourly.pm2_5[lastIdx];
        if (typeof m === "number") pm25Val = m; // µg/m³
      }
      if (pm10Val == null && lastIdx >= 0 && Array.isArray(openMeteo?.hourly?.pm10)) {
        const m = openMeteo.hourly.pm10[lastIdx];
        if (typeof m === "number") pm10Val = m; // µg/m³
      }
      // O3: keep AirNow AQI + OpenAQ concentration; Open-Meteo endpoint used here doesn't provide O3 conc.
      if (o3Val == null && lastIdx >= 0 && Array.isArray(openMeteo?.hourly?.ozone)) {
        const m = openMeteo.hourly.ozone[lastIdx];
        if (typeof m === "number") o3Val = m; // µg/m³
      }
      // AQIs (prefer AirNow)
      const o3AQI = typeof o3Obs?.AQI === "number" ? o3Obs.AQI : null;
      const pm25AQI0 = typeof pm25Obs?.AQI === "number" ? pm25Obs.AQI : null;
      const pm10AQI0 = typeof pm10Obs?.AQI === "number" ? pm10Obs.AQI : null;

      const pm25AQI = pm25AQI0 ?? calcAQI("pm25", pm25Val);
      const pm10AQI = pm10AQI0 ?? calcAQI("pm10", pm10Val);
      const overallAQI = Math.max(pm25AQI ?? 0, pm10AQI ?? 0, o3AQI ?? 0);

      // ---------- Pollen: Open-Meteo (hour match in CT) ----------

      const pollenHours = openMeteo?.hourly || {};
      const findHourIndex = (): number => {
        if (!Array.isArray(pollenHours?.time)) return -1;
        const nowCT =
          new Date()
            .toLocaleString("sv-SE", {
              timeZone: "America/Chicago",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })
            .replace(" ", "T")
            .slice(0, 13) + ":00";
        let idx = pollenHours.time.findIndex((t: string) => t.startsWith(nowCT));
        if (idx < 0) idx = pollenHours.time.length - 1;
        return idx;
      };
      const idx = findHourIndex();
      const pickPollen = (arr?: (number | null)[]) =>
        idx >= 0 && Array.isArray(arr) && typeof arr[idx] === "number"
          ? (arr[idx] as number)
          : 0;
      const treePollen = pickPollen(pollenHours.pollen_tree);
      const grassPollen = pickPollen(pollenHours.grass_pollen);
      const weedPollen = pickPollen(pollenHours.ragweed_pollen);

      // ---------- Process 5-day forecast ----------
      const processForecast = (): ForecastDay[] => {
        // Use AirNow forecast data first (same API as current metrics)
        const airNowForecast = airNow?.forecast || [];
        
        if (airNowForecast.length > 0) {
          // Use AirNow forecast data (preferred)
          return airNowForecast.slice(0, 5).map((fcItem: any, idx: number) => {
            const date = new Date(fcItem.DateForecast);
            const dayName = idx === 0 ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short' });
            
            // AirNow provides AQI directly
            const overallAQI = fcItem.AQI || 0;
            const primaryPollutant = fcItem.ParameterName || 'PM2.5';
            
            return {
              date: fcItem.DateForecast,
              dayName,
              overallAQI,
              category: aqiCategory(overallAQI),
              primaryPollutant
            };
          });
        }
        
        // Fallback to Open-Meteo hourly forecast if AirNow forecast not available
        if (openMeteoAQ?.hourly) {
          const times = openMeteoAQ.hourly.time || [];
          const aqiHourly = openMeteoAQ.hourly.us_aqi || [];
          const pm25Hourly = openMeteoAQ.hourly.pm2_5 || [];
          const pm10Hourly = openMeteoAQ.hourly.pm10 || [];
          const ozoneHourly = openMeteoAQ.hourly.ozone || [];
          
          // Group hourly data by day and get daily averages
          const dailyData: { [key: string]: { aqi: number[], pm25: number[], pm10: number[], ozone: number[] } } = {};
          
          times.forEach((timeStr: string, idx: number) => {
            const date = new Date(timeStr);
            const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD format
            
            if (!dailyData[dateKey]) {
              dailyData[dateKey] = { aqi: [], pm25: [], pm10: [], ozone: [] };
            }
            
            if (aqiHourly[idx]) dailyData[dateKey].aqi.push(aqiHourly[idx]);
            if (pm25Hourly[idx]) dailyData[dateKey].pm25.push(pm25Hourly[idx]);
            if (pm10Hourly[idx]) dailyData[dateKey].pm10.push(pm10Hourly[idx]);
            if (ozoneHourly[idx]) dailyData[dateKey].ozone.push(ozoneHourly[idx]);
          });
          
          const dailyDates = Object.keys(dailyData).sort().slice(0, 5);
          
          return dailyDates.map((dateStr: string, idx: number) => {
            const date = new Date(dateStr);
            const dayName = idx === 0 ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short' });
            
            const dayData = dailyData[dateStr];
            
            // For "Today", use current AQI to match Air Quality Metrics
            if (idx === 0) {
              return {
                date: dateStr,
                dayName,
                overallAQI: overallAQI || 25, // Use current overall AQI from Air Quality Metrics
                category: aqiCategory(overallAQI || 25),
                primaryPollutant: 'Current'
              };
            }
            
            // For future days, calculate daily average AQI
            let forecastAQI = 25; // Default
            if (dayData.aqi.length > 0) {
              forecastAQI = Math.round(dayData.aqi.reduce((a, b) => a + b, 0) / dayData.aqi.length);
            } else {
              // Calculate from concentrations if direct AQI not available
              const avgPM25 = dayData.pm25.length > 0 ? dayData.pm25.reduce((a, b) => a + b, 0) / dayData.pm25.length : 0;
              const avgPM10 = dayData.pm10.length > 0 ? dayData.pm10.reduce((a, b) => a + b, 0) / dayData.pm10.length : 0;
              const avgOzone = dayData.ozone.length > 0 ? dayData.ozone.reduce((a, b) => a + b, 0) / dayData.ozone.length : 0;
              
              const pm25AQI = avgPM25 > 0 ? calcAQI("pm25", avgPM25) : 0;
              const pm10AQI = avgPM10 > 0 ? calcAQI("pm10", avgPM10) : 0;
              const ozoneAQI = avgOzone > 0 ? calcAQI("ozone", avgOzone) : 0;
              
              forecastAQI = Math.max(pm25AQI || 0, pm10AQI || 0, ozoneAQI || 0) || 25;
            }
            
            return {
              date: dateStr,
              dayName,
              overallAQI: forecastAQI,
              category: aqiCategory(forecastAQI),
              primaryPollutant: 'Forecast'
            };
          });
        }
        
        return []; // No forecast data available
      };
      
      const forecast = processForecast();
      
      console.log('Forecast data:', {
        source: airNow?.forecast?.length > 0 ? 'AirNow' : (openMeteoAQ?.daily ? 'Open-Meteo' : 'None'),
        airNowForecastCount: airNow?.forecast?.length || 0,
        openMeteoDaily: !!openMeteoAQ?.daily,
        generatedForecast: forecast
      });

      // ---------- Has data if ANYTHING is present ----------
      const hasAnyAQI = o3AQI != null || pm25AQI != null || pm10AQI != null;
      const hasAnyValue = o3Val != null || pm25Val != null || pm10Val != null;
      const hasPollenData = !!(treePollen || grassPollen || weedPollen);

      const updatedAtISO =
        airNow?.observations?.[0]
          ? new Date(
              `${airNow.observations[0].DateObserved}T${String(
                airNow.observations[0].HourObserved
              ).padStart(2, "0")}:00:00`
            ).toISOString()
          : new Date().toISOString();

      const finalSummary: AirQualitySummary = {
        updatedAt: updatedAtISO,
        hasData: hasAnyAQI || hasAnyValue || hasPollenData,
        coordinates: { lat: center.lat, lon: center.lon }, // Add for debugging
        forecast: forecast.length > 0 ? forecast : undefined,
        dataSource: [
          hasAnyAQI && "AirNow",
          (pm25ValOAQ != null || pm10ValOAQ != null || o3ValOAQ != null) && "OpenAQ",
          hasPollenData && "Open-Meteo",
          (openMeteoFallback?.pm2_5 != null || openMeteoFallback?.pm10 != null) && "Open-Meteo AQ",
          forecast.length > 0 && (airNow?.forecast?.length > 0 ? "AirNow Forecast" : "Open-Meteo Forecast"),
        ]
          .filter(Boolean)
          .join(", "),
        overallAQI,
        pollutants: {
          o3: {
            aqi: o3AQI,
            value: o3Val,
            unit: o3Unit,
            category: aqiCategory(o3AQI),
          },
          pm25: {
            aqi: pm25AQI,
            value: pm25Val,
            unit: pm25Unit,
            category: aqiCategory(pm25AQI),
          },
          pm10: {
            aqi: pm10AQI,
            value: pm10Val,
            unit: pm10Unit,
            category: aqiCategory(pm10AQI),
          },
        },
        pollen: {
          tree: treePollen,
          grass: grassPollen,
          weed: weedPollen,
          source: hasPollenData ? "Open-Meteo" : "—",
        },
      };

      setSummary(finalSummary);

      if (!finalSummary.hasData) {
        if (airNow?.error?.includes('API_KEY')) {
          setError("⚠️ API keys not configured. Please add AIRNOW_API_KEY to .env.local for live data.");
        } else {
          setError("No live data available for this location. Displaying fallback values.");
        }
      }
    } catch (err: any) {
      console.error("Error loading data:", err);
      setError("Failed to fetch live data. Displaying fallback values.");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load data for all counties to show markers
  const loadAllCountyMarkers = useCallback(async () => {
    const markers: CountyMarker[] = [];
    const countyNames = Object.keys(countyCenters);
    
    const promises = countyNames.map(async (countyName) => {
      const center = countyCenters[countyName];
      try {
        const [openaqResults, airNow, openMeteoAQ] = await Promise.all([
          fetchOpenAQLatest({ lat: center.lat, lon: center.lon }),
          fetchAirNow({ lat: center.lat, lon: center.lon, distance: 50 }),
          fetchOpenMeteoAirQuality({ lat: center.lat, lon: center.lon }),
        ]);

        const getObs = (name: string) =>
          Array.isArray(airNow?.observations)
            ? airNow.observations.find(
                (o: any) => o?.ParameterName?.toLowerCase() === name
              )
            : null;

        const pm25Obs = getObs("pm2.5");
        const pm10Obs = getObs("pm10");
        const o3Obs = getObs("o3");

        const pm25ValOAQ = medianFromOpenAQ(openaqResults, "pm25");
        const pm10ValOAQ = medianFromOpenAQ(openaqResults, "pm10");
        const openMeteoFallback = openMeteoAQ?.current;

        let pm25Val =
          typeof pm25Obs?.Concentration === "number"
            ? pm25Obs.Concentration
            : pm25ValOAQ || openMeteoFallback?.pm2_5;
        let pm10Val =
          typeof pm10Obs?.Concentration === "number"
            ? pm10Obs.Concentration
            : pm10ValOAQ || openMeteoFallback?.pm10;

        const pm25AQI = typeof pm25Obs?.AQI === "number" ? pm25Obs.AQI : calcAQI("pm25", pm25Val);
        const pm10AQI = typeof pm10Obs?.AQI === "number" ? pm10Obs.AQI : calcAQI("pm10", pm10Val);
        const o3AQI = typeof o3Obs?.AQI === "number" ? o3Obs.AQI : null;
        
        const overallAQI = Math.max(pm25AQI ?? 0, pm10AQI ?? 0, o3AQI ?? 0);
        const unit = pm25Obs?.Unit || pm10Obs?.Unit || "µg/m³";

        return {
          lat: center.lat,
          lon: center.lon,
          aqi: overallAQI > 0 ? overallAQI : null,
          unit: unit,
          countyName: countyName,
        };
      } catch (err) {
        console.error(`Error loading data for ${countyName}:`, err);
        return {
          lat: center.lat,
          lon: center.lon,
          aqi: null,
          unit: "µg/m³",
          countyName: countyName,
        };
      }
    });

    const results = await Promise.all(promises);
    markers.push(...results.filter((m) => m != null));
    setAllCountyMarkers(markers);
  }, []);

  // Load all county markers on mount
  useEffect(() => {
    loadAllCountyMarkers();
  }, [loadAllCountyMarkers]);

  const [shouldZoom, setShouldZoom] = useState(false);

  useEffect(() => {
    if (county !== "My location") {
      const center = countyCenters[county];
      if (center) {
        console.log(`County changed to: ${county}, using coordinates:`, center);
        setCoords(center);
        setShouldZoom(true); // Enable zoom when dropdown changes
        loadData(center, county);
        // Reset zoom flag after a short delay
        setTimeout(() => setShouldZoom(false), 100);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [county]);

  // Use my location
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setCounty("My location");
      },
      (geoError) => {
        setError(`Geolocation failed: ${geoError.message}`);
        setLoading(false);
      }
    );
  };

  // Handle location change from map
  const handleMapLocationChange = (lat: number, lon: number) => {
    setCoords({ lat, lon });
    setCounty("My location");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-50 to-emerald-50 text-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-white/80 border-b border-white/20 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
              BE
            </div>
            <div>
              <div className="font-bold text-lg leading-tight bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">
                BreatheEasy Houston
              </div>
              <div className="text-sm text-gray-600 leading-tight">
                Real-time Air Quality & Pollen Dashboard
              </div>
            </div>
          </div>

          <div className="ml-8">
            <select
              className="rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm bg-white shadow-sm hover:border-sky-300 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all duration-200"
              value={county}
              onChange={(e) => setCounty(e.target.value)}
            >
              {[
                "Harris County",
                "Fort Bend County",
                "Montgomery County",
                "Brazoria County",
                "Galveston County",
                "Waller County",
                "Liberty County",
                "Chambers County",
              ].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              {county === "My location" && (
                <option value="My location" disabled hidden>
                  My location
                </option>
              )}
            </select>
          </div>

          {/* Right-aligned datetime widget */}
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden md:flex items-center gap-3 text-sm text-gray-700">
              <div
                className="h-10 w-10 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center shadow-sm"
                title="Central Time"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  className="h-5 w-5 text-gray-600"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </div>
              <div className="leading-tight">
                <div className="font-semibold">{weekday} · CT</div>
                <div className="text-xs text-gray-500">
                  {dateStr} • {timeStr}
                </div>
              </div>
            </div>
            <button
              className="rounded-xl border-2 border-sky-200 px-4 py-2.5 text-sm font-medium text-sky-700 hover:bg-sky-50 hover:border-sky-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
              onClick={handleUseMyLocation}
              disabled={loading}
            >
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {loading && county === "My location" ? "Locating..." : "Use my location"}
              </div>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Hero Section */}
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-sky-600 via-blue-600 to-emerald-600 bg-clip-text text-transparent mb-4">
            Houston Air Quality Dashboard
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Real-time monitoring of air quality and pollen levels across the Greater Houston area
          </p>
        </div>

        {/* Status messages */}
        {loading && (
          <div className="mb-6 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-sky-50 text-blue-800 p-4 text-sm shadow-sm">
            <div className="flex items-center gap-3">
              <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
              <span className="font-medium">Loading air quality data...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-pink-50 text-red-800 p-4 text-sm shadow-sm">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">{error}</span>
            </div>
            {error.includes('API_KEY') && (
              <div className="mt-3 p-3 bg-red-100 rounded-lg">
                <p className="font-medium mb-2">To get live air quality data:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Get a free AirNow API key from <a href="https://docs.airnowapi.org/account/request/" target="_blank" rel="noopener noreferrer" className="underline hover:text-red-900">docs.airnowapi.org</a></li>
                  <li>Add <code className="bg-red-200 px-1 rounded text-xs">AIRNOW_API_KEY=your_key_here</code> to your <code className="bg-red-200 px-1 rounded">.env.local</code> file</li>
                  <li>Restart the development server</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {summary && summary.hasData && !loading && !error && (
          <div className="mb-6 rounded-2xl border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 text-green-800 p-4 text-sm shadow-sm">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">
                Live data from {summary.dataSource} — Updated{" "}
                {new Date(summary.updatedAt).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "America/Chicago",
                })}{" "}
                CT
              </span>
            </div>
          </div>
        )}

        {!loading && !error && summary && !summary.hasData && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 text-amber-800 p-4 text-sm shadow-sm">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">
                No live data available for this location. Displaying default/fallback values.
              </span>
            </div>
          </div>
        )}

        {/* Main Dashboard Layout - 40% | 30% | 30% */}
        <section className="grid grid-cols-1 lg:grid-cols-10 gap-8 mb-24 lg:h-[500px]">
          {/* Left Section - 40% - Air Quality Cards */}
          <div className="lg:col-span-4 h-full">
            <div className="rounded-3xl border border-white/50 bg-white/80 backdrop-blur-sm shadow-xl p-6 h-full flex flex-col">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 bg-gradient-to-br from-sky-400 to-blue-500 rounded-xl flex items-center justify-center">
                  <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-800">Air Quality Metrics</h2>
                  <p className="text-sm text-gray-500">Real-time pollutant levels</p>
                </div>
              </div>
              
              {/* 2x2 Grid for Air Quality Cards */}
              <div className="grid grid-cols-2 gap-4 flex-1">
                <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-4 flex flex-col justify-between h-full">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">PM₁₀</div>
                  <div className="text-2xl font-bold text-gray-800 mb-1">
                    {summary && summary.hasData && summary.pollutants?.pm10?.value != null
                      ? `${Number(summary.pollutants.pm10.value).toFixed(0)}`
                      : "--"}
                  </div>
                  <div className="text-xs text-gray-500 mb-2">
                    {summary?.hasData && summary.pollutants?.pm10
                      ? `${summary.pollutants.pm10.unit} • ${summary.pollutants.pm10.category}`
                      : loading ? "Loading..." : "No data for this location"}
                  </div>
                  {typeof summary?.pollutants?.pm10?.aqi === "number" && summary.pollutants.pm10.aqi >= 0 ? (
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-white text-xs font-medium ${aqiColor(summary.pollutants.pm10.aqi)}`}>
                      AQI {summary.pollutants.pm10.aqi}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-gray-600 text-xs">
                      {loading ? "Loading..." : "No data"}
                    </span>
                  )}
                </div>

                <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-4 flex flex-col justify-between h-full">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">PM₂.₅</div>
                  <div className="text-2xl font-bold text-gray-800 mb-1">
                    {summary && summary.hasData && summary.pollutants?.pm25?.value != null
                      ? `${Number(summary.pollutants.pm25.value).toFixed(1)}`
                      : "--"}
                  </div>
                  <div className="text-xs text-gray-500 mb-2">
                    {summary?.hasData && summary.pollutants?.pm25
                      ? `${summary.pollutants.pm25.unit} • ${summary.pollutants.pm25.category}`
                      : loading ? "Loading..." : "No data for this location"}
                  </div>
                  {typeof summary?.pollutants?.pm25?.aqi === "number" && summary.pollutants.pm25.aqi >= 0 ? (
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-white text-xs font-medium ${aqiColor(summary.pollutants.pm25.aqi)}`}>
                      AQI {summary.pollutants.pm25.aqi}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-gray-600 text-xs">
                      {loading ? "Loading..." : "No data"}
                    </span>
                  )}
                </div>

                <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-4 flex flex-col justify-between h-full">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">O₃ (Ozone)</div>
                  <div className="text-2xl font-bold text-gray-800 mb-1">
                    {summary && summary.hasData && summary.pollutants?.o3?.value != null
                      ? `${Number(summary.pollutants.o3.value).toFixed(2)}`
                      : "--"}
                  </div>
                  <div className="text-xs text-gray-500 mb-2">
                    {summary?.hasData && summary.pollutants?.o3
                      ? `${summary.pollutants.o3.unit} • recent`
                      : loading ? "Loading..." : "No data for this location"}
                  </div>
                  {typeof summary?.pollutants?.o3?.aqi === "number" && summary.pollutants.o3.aqi >= 0 ? (
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-white text-xs font-medium ${aqiColor(summary.pollutants.o3.aqi)}`}>
                      AQI {summary.pollutants.o3.aqi}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-gray-600 text-xs">
                      {loading ? "Loading..." : "No data"}
                    </span>
                  )}
                </div>

                <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-emerald-50 to-white p-4 flex flex-col justify-between h-full">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Overall AQI</div>
                  <div className="text-2xl font-bold text-gray-800 mb-1">
                    {summary ? (summary.hasData ? summary.overallAQI : "--") : "--"}
                  </div>
                  <div className="text-xs text-gray-500 mb-2">
                    {summary?.hasData
                      ? `Updated ${new Date(summary.updatedAt).toLocaleTimeString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "America/Chicago",
                        })} CT`
                      : loading
                      ? "Loading..."
                      : "No data"}
                  </div>
                  {typeof summary?.overallAQI === "number" && summary.overallAQI >= 0 && summary.hasData ? (
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-white text-xs font-medium ${aqiColor(summary.overallAQI)}`}>
                      AQI {summary.overallAQI}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-gray-600 text-xs">
                      {loading ? "Loading..." : "No data"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Middle Section - 30% - Pollen Card */}
          <div className="lg:col-span-3 h-full">
            <div className="h-full">
              <PollenCard county={county.toLowerCase().replace(' county', '').replace(' ', '-')} />
            </div>
          </div>

          {/* Right Section - 30% - 5-Day Forecast */}
          <div className="lg:col-span-3 h-full">
            <div className="rounded-3xl border border-white/50 bg-white/80 backdrop-blur-sm shadow-xl p-6 h-full flex flex-col">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-8 w-8 bg-gradient-to-br from-purple-400 to-pink-500 rounded-lg flex items-center justify-center">
                  <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-800">5-Day AQI Forecast</h2>
                  <div className="text-sm text-gray-500">
                    {summary?.forecast && summary.forecast.length > 0 
                      ? (summary.dataSource.includes('AirNow Forecast') ? "AirNow predictions" : "Open-Meteo predictions")
                      : loading ? "Loading..." : "No forecast data"}
                  </div>
                </div>
              </div>
              <ul className="space-y-3 flex-1 flex flex-col justify-center">
                {summary?.forecast && summary.forecast.length > 0 ? (
                  summary.forecast.map((day, i) => (
                    <li
                      key={day.date}
                      className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50/50 p-3 hover:bg-gray-100/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="text-sm font-medium">{day.dayName}</div>
                          <div className="text-xs text-gray-500">
                            {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-gray-700">
                          {day.overallAQI}
                        </div>
                      </div>
                    </li>
                  ))
                ) : (
                  [...Array(5)].map((_, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50/50 p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-sm font-medium">Day {i + 1}</div>
                      </div>
                      <div className="text-sm font-semibold text-gray-400">
                        {loading ? "Loading..." : "--"}
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </section>

        {/* Map section */}
        <section className="mb-16">
          <div className="rounded-3xl border border-white/50 bg-white/80 backdrop-blur-sm shadow-xl h-[480px] p-6 flex flex-col">
            <div className="flex items-center justify-between pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-gradient-to-br from-sky-400 to-blue-500 rounded-xl flex items-center justify-center">
                  <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-800">Air Quality Monitoring Map</h2>
                  <p className="text-sm text-gray-500">Interactive station data visualization</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500 bg-gradient-to-r from-emerald-50 to-green-50 px-3 py-1.5 rounded-full border border-green-200">
                <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="font-medium text-green-700">Live</span>
              </div>
            </div>
            <div className="flex-1">
              <AirQualityMap
                latitude={coords.lat}
                longitude={coords.lon}
                overallAQI={summary?.overallAQI}
                unit={summary?.pollutants?.pm25?.unit || summary?.pollutants?.pm10?.unit || "µg/m³"}
                onLocationChange={handleMapLocationChange}
                countyCenters={countyCenters}
                allCountyMarkers={allCountyMarkers}
                shouldZoom={shouldZoom}
                onMarkerClick={(lat, lon, countyName) => {
                  // Navigate to clicked county location and update dropdown
                  if (countyName) {
                    setCounty(countyName); // Update dropdown
                    setCoords({ lat, lon }); // Use exact coordinates from marker
                    const center = { lat, lon };
                    // Don't set shouldZoom here - marker click handles its own zoom
                    loadData(center, countyName);
                  }
                }}
              />
            </div>
          </div>
        </section>

        {/* Trends placeholder */}
        <section className="mt-12">
          <div className="rounded-3xl border border-white/50 bg-white/80 backdrop-blur-sm shadow-xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center">
                  <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-800">24-Hour Trends</h2>
                  <p className="text-sm text-gray-500">Historical air quality data</p>
                </div>
              </div>
              <div className="flex gap-2 text-sm">
                {"O₃, PM₂.₅, PM₁₀".split(", ").map((t) => (
                  <button key={t} className="px-4 py-2 rounded-xl border-2 border-gray-200 hover:border-sky-300 hover:bg-sky-50 transition-all duration-200 font-medium">
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-72 rounded-2xl bg-gradient-to-br from-gray-50 via-white to-gray-50 border-2 border-dashed border-gray-300 grid place-items-center">
              <div className="text-center">
                <div className="h-16 w-16 mx-auto mb-4 bg-gradient-to-br from-gray-400 to-gray-500 rounded-full flex items-center justify-center">
                  <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                  </svg>
                </div>
                <p className="text-gray-600 font-medium">Interactive trend charts</p>
                <p className="text-gray-500 text-sm mt-1">Historical data visualization coming soon</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer with visit counters */}
      <footer className="border-t border-white/20 bg-white/60 backdrop-blur-sm mt-16">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-white/80 px-3 py-1.5 rounded-full">
              <svg className="h-4 w-4 text-sky-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
              </svg>
              <span>Today: <strong>{today}</strong></span>
            </div>
            <div className="flex items-center gap-2 bg-white/80 px-3 py-1.5 rounded-full">
              <svg className="h-4 w-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Total: <strong>{total}</strong></span>
            </div>
          </div>
          <div className="text-xs text-gray-500 bg-white/80 px-3 py-1.5 rounded-full">
            Data sources: AirNow, OpenAQ, Open-Meteo, IQAir
          </div>
        </div>
      </footer>
    </div>
  );
}
