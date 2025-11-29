'use client';

import { useState, useEffect } from 'react';

// Custom SVG Icons
const TreeIcon = () => (
  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2L8 8h8l-4-6zM12 22v-6M8 8c-2.21 0-4 1.79-4 4s1.79 4 4 4c.74 0 1.44-.2 2.04-.55C10.36 16.24 10.68 17 11.13 17.6c-.39.24-.87.4-1.38.4-1.66 0-3-1.34-3-3s1.34-3 3-3c.51 0 .99.16 1.38.4-.45.6-.77 1.36-1.09 2.15C9.44 14.2 8.74 14 8 14c-1.1 0-2 .9-2 2s.9 2 2 2c.74 0 1.44-.2 2.04-.55C10.36 17.76 10.68 18.5 11.13 19.1c-.39.24-.87.4-1.38.4-1.66 0-3-1.34-3-3 0-.51.13-.99.36-1.41-.97-.74-1.61-1.9-1.61-3.21 0-2.21 1.79-4 4-4z"/>
    <path d="M16 8c2.21 0 4 1.79 4 4s-1.79 4-4 4c-.74 0-1.44-.2-2.04-.55.32-.79.64-1.53 1.09-2.15C15.56 13.8 16.26 14 17 14c1.1 0 2-.9 2-2s-.9-2-2-2c-.74 0-1.44.2-2.04.55-.32.79-.64 1.53-1.09 2.15C14.56 12.2 15.26 12 16 12c1.66 0 3 1.34 3 3s-1.34 3-3 3c-.51 0-.99-.16-1.38-.4.45-.6.77-1.34 1.09-2.1.6.35 1.3.55 2.04.55 1.66 0 3-1.34 3-3s-1.34-3-3-3c-.51 0-.99.16-1.38.4.45.6.77 1.36 1.09 2.15-.6-.35-1.3-.55-2.04-.55z"/>
  </svg>
);

const GrassIcon = () => (
  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 20v2h-2v-2c-4.97 0-9-4.03-9-9h2c0 3.87 3.13 7 7 7v-7H8l4-6 4 6h-2v7c3.87 0 7-3.13 7-7h2c0 4.97-4.03 9-9 9z"/>
    <path d="M4 15c0-2.21 1.79-4 4-4v4c-1.1 0-2 .9-2 2h-2v-2zm16 0v2h-2c0-1.1-.9-2-2-2v-4c2.21 0 4 1.79 4 4z"/>
    <path d="M3 22h18v2H3z"/>
  </svg>
);

const WeedIcon = () => (
  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2l2 6h6l-4.5 3.5L17 18l-5-4-5 4 1.5-6.5L4 8h6l2-6z"/>
    <path d="M8 14l-2 2 2 2-2 2 2 2m8-8l2 2-2 2 2 2-2 2"/>
    <circle cx="12" cy="12" r="2"/>
  </svg>
);

const TemperatureIcon = () => (
  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
    <path d="M15 13V5c0-1.66-1.34-3-3-3S9 3.34 9 5v8c-1.21.91-2 2.37-2 4 0 2.76 2.24 5 5 5s5-2.24 5-5c0-1.63-.79-3.09-2-4zm-4-2V5c0-.55.45-1 1-1s1 .45 1 1v6h-2z"/>
  </svg>
);

const WindIcon = ({ rotation }: { rotation?: string }) => (
  <svg 
    className="w-6 h-6" 
    fill="currentColor" 
    viewBox="0 0 24 24"
    style={rotation ? { transform: rotation.match(/rotate\([^)]+\)/)?.[0] || 'none' } : undefined}
  >
    <path d="M4 10v4h2l8-8 8 8h2v-4l-10-10L4 10zM6 14h2v6h8v-6h2v8H6v-8z"/>
    <path d="M2 18h4v2H2zm16 0h4v2h-4z"/>
  </svg>
);

const HumidityIcon = () => (
  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2C20 10.48 17.33 6.55 12 2zm0 18c-3.35 0-6-2.57-6-6.2 0-2.34 1.95-5.44 6-9.14 4.05 3.7 6 6.79 6 9.14 0 3.63-2.65 6.2-6 6.2z"/>
    <path d="M12 6c-2.67 2.27-4 4.24-4 5.9 0 2.49 1.79 4.1 4 4.1s4-1.61 4-4.1C16 10.24 14.67 8.27 12 6z"/>
  </svg>
);

interface PollenType {
  type: string;
  level: string;
  icon: string;
}

interface Weather {
  temperature: string;
  temperatureIcon: string;
  wind: string;
  windIcon: string;
  windRotation: string;
  humidity: string;
  humidityIcon: string;
}

interface PollenData {
  index: {
    level: string;
    image: string;
  };
  types: PollenType[];
  weather: Weather;
}

interface PollenCardProps {
  county?: string;
}

export default function PollenCard({ county = 'harris-county' }: PollenCardProps) {
  const [pollenData, setPollenData] = useState<PollenData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPollenData = async (countyName: string) => {
    setLoading(true);
    setError(null);

    if (countyName.trim() === 'fort-bend' || countyName.trim() === 'chambers') {
        countyName = 'houston';
    }
    
    try {
      const response = await fetch(`/api/pollen?county=${encodeURIComponent(countyName)}`);
      const data = await response.json();
      
      if (data.success === false) {
        setError(data.error);
      } else {
        setPollenData(data);
      }
    } catch (err) {
      setError('Failed to fetch pollen data');
      console.error('Error fetching pollen data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPollenData(county);
  }, [county]);

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/50 bg-white/80 backdrop-blur-sm shadow-xl p-6 w-full h-full flex flex-col">
        <div className="animate-pulse flex-1 flex flex-col">
          <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
          <div className="space-y-3 flex-1">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-red-200 bg-gradient-to-r from-red-50 to-pink-50 shadow-xl p-6 w-full h-full flex flex-col">
        <div className="text-red-800 flex-1 flex flex-col justify-center">
          <h3 className="font-semibold mb-2">Error Loading Pollen Data</h3>
          <p className="text-sm">“Invalid location. Please select one within Houston premises.”</p>
          <button 
            onClick={() => fetchPollenData(county)}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!pollenData) {
    return null;
  }

  const getLevelColor = (level: string) => {
    const lowerLevel = level.toLowerCase();
    if (lowerLevel.includes('low')) return 'text-green-600 bg-green-50';
    if (lowerLevel.includes('moderate')) return 'text-yellow-600 bg-yellow-50';
    if (lowerLevel.includes('high')) return 'text-red-600 bg-red-50';
    if (lowerLevel.includes('very high')) return 'text-red-800 bg-red-100';
    return 'text-gray-600 bg-gray-50';
  };

  const handleRefresh = () => {
    fetchPollenData(county);
  };

  return (
    <div className="rounded-3xl border border-white/50 bg-white/80 backdrop-blur-sm shadow-xl p-6 w-full h-full flex flex-col">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-gradient-to-br from-emerald-400 to-green-500 rounded-lg flex items-center justify-center">
            <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-800">
              Pollen Forecast
            </h2>
            <p className="text-sm text-gray-500">{county.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Refresh pollen data"
        >
          <svg
            className={`w-5 h-5 text-gray-600 ${loading ? 'animate-spin' : ''}`}
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
      </div>
      
      <div className="flex-1 flex flex-col space-y-4">
        {/* Overall Pollen Index */}
        {pollenData.index.level && (
          <div>
            <h3 className="text-sm font-semibold mb-2 text-gray-700">Overall Index</h3>
            <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getLevelColor(pollenData.index.level)}`}>
              {pollenData.index.level}
            </div>
          </div>
        )}

        {/* Pollen Types */}
        {pollenData.types.length > 0 && (
          <div className="flex-1">
            <h3 className="text-sm font-semibold mb-3 text-gray-700">Pollen Types</h3>
            <div className="space-y-2">
              {pollenData.types.map((pollen, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center">
                    <div className="mr-3 text-green-600">
                      {pollen.type === 'Tree' && <TreeIcon />}
                      {pollen.type === 'Grass' && <GrassIcon />}
                      {pollen.type === 'Weed' && <WeedIcon />}
                    </div>
                    <span className="font-medium text-gray-700">{pollen.type}</span>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getLevelColor(pollen.level)}`}>
                    {pollen.level}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weather Information */}
        {pollenData.weather && (
          <div>
            <h3 className="text-sm font-semibold mb-3 text-gray-700">Weather Conditions</h3>
            <div className="grid grid-cols-3 gap-2">
              {pollenData.weather.temperature && (
                <div className="text-center p-2 bg-blue-50 rounded-xl">
                  <div className="text-blue-600 flex justify-center mb-1">
                    <TemperatureIcon />
                  </div>
                  <div className="text-xs font-medium text-blue-800">{pollenData.weather.temperature}</div>
                </div>
              )}
              
              {pollenData.weather.wind && (
                <div className="text-center p-2 bg-gray-50 rounded-xl">
                  <div className="text-gray-600 flex justify-center mb-1">
                    <WindIcon rotation={pollenData.weather.windRotation} />
                  </div>
                  <div className="text-xs font-medium text-gray-800">{pollenData.weather.wind}</div>
                </div>
              )}
              
              {pollenData.weather.humidity && (
                <div className="text-center p-2 bg-cyan-50 rounded-xl">
                  <div className="text-cyan-600 flex justify-center mb-1">
                    <HumidityIcon />
                  </div>
                  <div className="text-xs font-medium text-cyan-800">{pollenData.weather.humidity}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
       
      <div className="mt-4 pt-4 border-t border-gray-200">
        
        <p className="text-xs text-gray-500">
          Data sourced from IQAir
        </p>
      </div>
    </div>
  );
}