"use client";

import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface CountyCenter {
  lat: number;
  lon: number;
}

export interface CountyMarker {
  lat: number;
  lon: number;
  aqi: number | null;
  unit: string;
  countyName: string;
}

interface AirQualityMapProps {
  latitude: number;
  longitude: number;
  overallAQI?: number;
  unit?: string;
  onLocationChange?: (lat: number, lon: number) => void;
  countyCenters?: Record<string, CountyCenter>;
  onMarkerClick?: (lat: number, lon: number, countyName: string) => void;
  allCountyMarkers?: CountyMarker[];
  shouldZoom?: boolean; // Flag to indicate if we should zoom on location change
}

// Helper function to get AQI color based on standard AQI color scheme
function getAQIColor(aqi: number | null): string {
  if (aqi == null) return "#9CA3AF"; // gray-400 for no data
  if (aqi <= 50) return "#00E400"; // Green (Good: 0-50)
  if (aqi <= 100) return "#FFFF00"; // Yellow (Moderate: 51-100)
  if (aqi <= 150) return "#FF7E00"; // Orange (Unhealthy for Sensitive Groups: 101-150)
  if (aqi <= 200) return "#FF0000"; // Red (Unhealthy: 151-200)
  if (aqi <= 300) return "#8F3F97"; // Purple (Very Unhealthy: 201-300)
  return "#7E0023"; // Maroon (Hazardous: 301+)
}

export default function AirQualityMap({
  latitude,
  longitude,
  overallAQI,
  unit = "µg/m³",
  onLocationChange,
  countyCenters,
  onMarkerClick,
  allCountyMarkers = [],
  shouldZoom = false,
}: AirQualityMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [locating, setLocating] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(10);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {
            "osm-tiles": {
              type: "raster",
              tiles: [
                "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
                "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
                "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
              ],
              tileSize: 256,
              attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            },
          },
          layers: [
            {
              id: "osm-tiles",
              type: "raster",
              source: "osm-tiles",
              minzoom: 0,
              maxzoom: 24,
            },
          ],
        },
        center: [longitude, latitude],
        zoom: 10,
      });

      // Add navigation controls
      map.current.addControl(new maplibregl.NavigationControl(), "top-right");

      // Add scale control
      map.current.addControl(
        new maplibregl.ScaleControl({
          maxWidth: 100,
          unit: "imperial",
        }),
        "bottom-left"
      );

      map.current.on("load", () => {
        setMapLoaded(true);
        setZoomLevel(map.current!.getZoom());
      });

      // Track zoom level changes
      map.current.on("zoom", () => {
        if (map.current) {
          setZoomLevel(map.current.getZoom());
        }
      });
    } catch (error) {
      console.error("Error initializing map:", error);
    }

    // Cleanup
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Handle locate me button click
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        
        // Update map center
        if (map.current) {
          map.current.flyTo({
            center: [lon, lat],
            zoom: 12,
            duration: 2000,
            essential: true,
          });
        }

        // Call parent callback if provided
        if (onLocationChange) {
          onLocationChange(lat, lon);
        }

        setLocating(false);
      },
      (error) => {
        console.error("Geolocation error:", error);
        alert(`Unable to get your location: ${error.message}`);
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  // Handle default view button click - zoom to show all markers without clustering
  const handleDefaultView = () => {
    if (!map.current) return;

    // Calculate center from all county markers if available, otherwise use initial center
    let centerLat = latitude;
    let centerLon = longitude;

    if (allCountyMarkers && allCountyMarkers.length > 0) {
      const validMarkers = allCountyMarkers.filter(
        (m) => m.lat != null && m.lon != null
      );
      if (validMarkers.length > 0) {
        const avgLat =
          validMarkers.reduce((sum, m) => sum + (m.lat || 0), 0) /
          validMarkers.length;
        const avgLon =
          validMarkers.reduce((sum, m) => sum + (m.lon || 0), 0) /
          validMarkers.length;
        centerLat = avgLat;
        centerLon = avgLon;
      }
    }

    // Zoom to level 8 (just above clustering threshold of 7)
    map.current.flyTo({
      center: [centerLon, centerLat],
      zoom: 7.2,
      duration: 1500,
      essential: true,
    });
  };

  // Helper function to cluster markers based on distance
  const clusterMarkers = (markers: CountyMarker[], clusterDistance: number) => {
    const clusters: Array<{ center: { lat: number; lon: number }; markers: CountyMarker[] }> = [];
    const processed = new Set<number>();

    markers.forEach((marker, index) => {
      if (processed.has(index) || marker.lat == null || marker.lon == null) return;

      const cluster = {
        center: { lat: marker.lat, lon: marker.lon },
        markers: [marker]
      };
      processed.add(index);

      // Find nearby markers to cluster
      markers.forEach((otherMarker, otherIndex) => {
        if (processed.has(otherIndex) || otherMarker.lat == null || otherMarker.lon == null) return;

        const distance = Math.sqrt(
          Math.pow(marker.lon - otherMarker.lon, 2) + 
          Math.pow(marker.lat - otherMarker.lat, 2)
        );

        // Convert clusterDistance (in degrees) - approximately 100 miles = 1.4 degrees
        if (distance < clusterDistance) {
          cluster.markers.push(otherMarker);
          processed.add(otherIndex);
          // Update cluster center to average
          cluster.center.lat = cluster.markers.reduce((sum, m) => sum + (m.lat || 0), 0) / cluster.markers.length;
          cluster.center.lon = cluster.markers.reduce((sum, m) => sum + (m.lon || 0), 0) / cluster.markers.length;
        }
      });

      clusters.push(cluster);
    });

    return clusters;
  };

  // Update all county markers and selected location marker
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Remove all existing markers
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    if (marker.current) {
      marker.current.remove();
      marker.current = null;
    }

    // Create markers for all counties
    if (allCountyMarkers && allCountyMarkers.length > 0) {
      // Check if we should cluster (zoom level <= 7 means view is > 100 miles)
      const shouldCluster = zoomLevel <= 7;

      if (shouldCluster) {
        // Cluster markers when zoomed out
        const clusters = clusterMarkers(allCountyMarkers, 1.4); // ~100 miles in degrees

        clusters.forEach((cluster) => {
          // Calculate average AQI
          const aqis = cluster.markers
            .map(m => m.aqi)
            .filter(aqi => aqi != null) as number[];
          const avgAQI = aqis.length > 0 
            ? Math.round(aqis.reduce((sum, aqi) => sum + aqi, 0) / aqis.length)
            : null;
          const count = cluster.markers.length;

          // Create cluster marker container
          const markerContainer = document.createElement("div");
          markerContainer.style.position = "relative";
          markerContainer.style.cursor = "pointer";
          markerContainer.style.width = "20px";
          markerContainer.style.height = "20px";
          markerContainer.style.zIndex = "100";

          // Create medium colored dot
          const dot = document.createElement("div");
          dot.style.width = "100%";
          dot.style.height = "100%";
          dot.style.borderRadius = "50%";
          dot.style.backgroundColor = getAQIColor(avgAQI);
          dot.style.border = "2px solid white";
          dot.style.boxShadow = "0 2px 6px rgba(0, 0, 0, 0.4)";
          dot.style.position = "relative";
          dot.style.zIndex = "10";

          markerContainer.appendChild(dot);

          // Create popup for cluster
          const popup = new maplibregl.Popup({
            offset: 25,
            closeButton: false,
            closeOnClick: false,
          }).setHTML(
            `
            <div style="padding: 12px; font-family: system-ui, -apple-system, sans-serif; min-width: 200px;">
              <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px;">
                Cluster Information
              </div>
              <div style="font-size: 14px; color: #6B7280; margin-bottom: 4px;">
                <strong>Positions:</strong> ${count}
              </div>
              <div style="font-size: 14px; color: #6B7280;">
                <strong>Average AQI:</strong> <span style="color: ${getAQIColor(avgAQI)}; font-weight: 600;">${avgAQI ?? "N/A"}</span>
              </div>
            </div>
          `
          );

          // Create and add cluster marker
          if (!map.current) return;
          const mapMarker = new maplibregl.Marker({ 
            element: markerContainer,
            anchor: "center"
          })
            .setLngLat([cluster.center.lon, cluster.center.lat])
            .setPopup(popup)
            .addTo(map.current);

          let hoverTimeout: NodeJS.Timeout | null = null;

          // Show popup on hover (tooltip behavior)
          markerContainer.addEventListener("mouseenter", () => {
            if (hoverTimeout) {
              clearTimeout(hoverTimeout);
              hoverTimeout = null;
            }
            if (!mapMarker.getPopup().isOpen()) {
              mapMarker.togglePopup();
            }
          });

          // Keep popup open when hovering over the popup itself
          const popupElement = popup.getElement();
          if (popupElement) {
            popupElement.addEventListener("mouseenter", () => {
              if (hoverTimeout) {
                clearTimeout(hoverTimeout);
                hoverTimeout = null;
              }
            });

            popupElement.addEventListener("mouseleave", () => {
              // Only close if mouse leaves both marker and popup
              hoverTimeout = setTimeout(() => {
                if (mapMarker.getPopup().isOpen()) {
                  mapMarker.togglePopup();
                }
              }, 100);
            });
          }

          markerContainer.addEventListener("mouseleave", () => {
            // Delay closing to allow moving to popup
            hoverTimeout = setTimeout(() => {
              if (mapMarker.getPopup().isOpen()) {
                mapMarker.togglePopup();
              }
            }, 100);
          });

          markers.current.push(mapMarker);
        });
      } else {
        // Show individual markers when zoomed in
        allCountyMarkers.forEach((county) => {
          if (county.lat == null || county.lon == null) return;

          // Check if this is the selected county
          const tolerance = 0.01;
          const isSelected = Math.abs(county.lat - latitude) < tolerance && 
                            Math.abs(county.lon - longitude) < tolerance;

          // Create marker container - only contains the dot, label is absolutely positioned
          const markerContainer = document.createElement("div");
          markerContainer.style.position = "relative";
          markerContainer.style.cursor = "pointer";
          markerContainer.style.width = isSelected ? "12px" : "10px";
          markerContainer.style.height = isSelected ? "12px" : "10px";
          markerContainer.style.zIndex = isSelected ? "1000" : "100";

          // Create mini colored dot - this will be anchored at the coordinates
          const dot = document.createElement("div");
          dot.style.width = "100%";
          dot.style.height = "100%";
          dot.style.borderRadius = "50%";
          dot.style.backgroundColor = getAQIColor(county.aqi);
          dot.style.border = isSelected ? "2px solid #3B82F6" : "2px solid white";
          dot.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.3)";
          dot.style.position = "relative";
          dot.style.zIndex = "10";

          // Create label with AQI and unit - positioned absolutely below dot
          const label = document.createElement("div");
          label.style.position = "absolute";
          label.style.top = isSelected ? "16px" : "14px";
          label.style.left = "50%";
          label.style.transform = "translateX(-50%)";
          label.style.whiteSpace = "nowrap";
          label.style.backgroundColor = "white";
          label.style.padding = "4px 8px";
          label.style.borderRadius = "8px";
          label.style.fontSize = isSelected ? "12px" : "11px";
          label.style.fontWeight = "600";
          label.style.color = "#374151";
          label.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.2)";
          label.style.border = isSelected ? "2px solid #3B82F6" : "1px solid #E5E7EB";
          label.style.pointerEvents = "auto"; // Enable pointer events so label is clickable
          label.style.cursor = "pointer";
          label.style.zIndex = "5";
          label.textContent = county.aqi != null 
            ? `AQI: ${county.aqi} ${county.unit}` 
            : `AQI: N/A`;

          markerContainer.appendChild(dot);
          markerContainer.appendChild(label);

          // Create and add marker - anchor at center of dot (which is center of container)
          if (!map.current) return;
          const mapMarker = new maplibregl.Marker({ 
            element: markerContainer,
            anchor: "center" // Anchor at center of dot, which matches container center
          })
            .setLngLat([county.lon, county.lat])
            .addTo(map.current);

          // Handle marker click - navigate to that county (works on both dot and label)
          const handleMarkerClick = (e: MouseEvent) => {
            e.stopPropagation();
            // Navigate map to clicked marker location immediately with zoom
            if (map.current) {
              map.current.flyTo({
                center: [county.lon, county.lat],
                zoom: 11, // Zoom in to show the location clearly
                duration: 1000,
                essential: true,
              });
            }
            // Then trigger the callback to update state and dropdown
            if (onMarkerClick) {
              onMarkerClick(county.lat, county.lon, county.countyName);
            }
          };

          markerContainer.addEventListener("click", handleMarkerClick);
          label.addEventListener("click", handleMarkerClick);

          markers.current.push(mapMarker);
        });
      }
    }

    // Navigate to selected location only when shouldZoom is true (dropdown change)
    if (shouldZoom) {
      const currentCenter = map.current.getCenter();
      const distance = Math.sqrt(
        Math.pow(currentCenter.lng - longitude, 2) + 
        Math.pow(currentCenter.lat - latitude, 2)
      );
      
      // Only animate if location changed significantly (more than ~1km)
      if (distance > 0.01) {
        map.current.flyTo({
          center: [longitude, latitude],
          zoom: 11, // Zoom in to show the location clearly
          duration: 1500,
          essential: true,
        });
      }
    }
  }, [latitude, longitude, overallAQI, unit, mapLoaded, allCountyMarkers, onMarkerClick, zoomLevel]);

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden">
      <div
        ref={mapContainer}
        className="w-full h-full"
        style={{ minHeight: "100%" }}
      />
      
      {/* Map Control Buttons */}
      {mapLoaded && (
        <div className="absolute top-4 left-4 flex flex-col gap-2">
          {/* Default View Button */}
          <button
            onClick={handleDefaultView}
            className="bg-white hover:bg-gray-50 rounded-xl shadow-lg border-2 border-gray-200 hover:border-sky-300 px-4 py-2.5 transition-all duration-200 group flex items-center gap-2"
            title="Reset to default view"
            aria-label="Reset to default view"
          >
            <svg
              className="h-4 w-4 text-sky-600 group-hover:text-sky-700"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>

          {/* Locate Me Button */}
          <button
            onClick={handleLocateMe}
            disabled={locating}
            className="bg-white hover:bg-gray-50 disabled:bg-gray-100 rounded-xl shadow-lg border-2 border-gray-200 hover:border-sky-300 disabled:border-gray-300 p-3 transition-all duration-200 group"
            title="Find my location"
            aria-label="Find my location"
          >
            {locating ? (
              <div className="animate-spin h-5 w-5 border-2 border-sky-500 border-t-transparent rounded-full"></div>
            ) : (
              <svg
                className="h-5 w-5 text-sky-600 group-hover:text-sky-700 group-disabled:text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            )}
          </button>
        </div>
      )}

      {!mapLoaded && (
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-sky-50 to-emerald-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin h-12 w-12 border-4 border-sky-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600 font-medium">Loading map...</p>
          </div>
        </div>
      )}
    </div>
  );
}





