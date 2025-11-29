import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';

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

interface ErrorResponse {
  success: false;
  error: string;
  timestamp: string;
}

/**
 * Get pollen data from IQAir website
 * @param {string} url - IQAir pollen forecast URL
 * @returns {Promise<PollenData | ErrorResponse>} - Pollen forecast data as JSON
 */
async function getPollenData(url: string): Promise<PollenData | ErrorResponse> {
  try {
    // Fetch the HTML from the URL
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    const pollenData: PollenData = {
      index: {
        level: "",
        image: ""
      },
      types: [],
      weather: {
        temperature: "",
        temperatureIcon: "",
        wind: "",
        windIcon: "",
        windRotation: "",
        humidity: "",
        humidityIcon: ""
      }
    };

    // Get index level - target the specific structure
    pollenData.index.level = $('img[alt="Pollen Index Level"]').parent().find('p').eq(1).text().trim();
    pollenData.index.image = $('img[alt="Pollen Index Level"]').attr('src') || '';

    // Get pollen types
    const pollenTypes = [
      { selector: 'img[alt="Tree"]', name: 'Tree' },
      { selector: 'img[alt="Grass"]', name: 'Grass' },
      { selector: 'img[alt="Weed"]', name: 'Weed' }
    ];

    pollenTypes.forEach(pollen => {
      const img = $(pollen.selector);
      const container = img.closest('div').parent().parent();
      const levelText = container.find('p').eq(1).text().trim();
      
      pollenData.types.push({
        type: pollen.name,
        level: levelText,
        icon: img.attr('src') || ''
      });
    });

    // Weather data
    const weatherDiv = $('div.flex.h-12');

    // Temperature
    const tempDiv = weatherDiv.find('img[alt="Weather icon"]').parent();
    pollenData.weather.temperature = tempDiv.find('span').text().trim();
    pollenData.weather.temperatureIcon = tempDiv.find('img').attr('src') || '';

    // Wind
    const windDiv = weatherDiv.find('img[src*="ic-wind"]').parent();
    const windSpan = windDiv.find('span');
    pollenData.weather.wind = windSpan.text().replace(/\s+/g, ' ').trim();
    pollenData.weather.windIcon = windDiv.find('img').attr('src') || '';
    pollenData.weather.windRotation = windDiv.find('img').attr('style') || '';

    // Humidity
    const humidityDiv = weatherDiv.find('img[alt="Humidity icon"]').parent();
    pollenData.weather.humidity = humidityDiv.find('span').text().trim();
    pollenData.weather.humidityIcon = humidityDiv.find('img').attr('src') || '';

    return pollenData;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      timestamp: new Date().toISOString()
    };
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const county = searchParams.get('county');
  const state = searchParams.get('state') || 'texas';
  const country = searchParams.get('country') || 'usa';

  if (!county) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'County parameter is required',
        timestamp: new Date().toISOString()
      },
      { status: 400 }
    );
  }

  try {
    const url = `https://www.iqair.com/gb/pollen/${country}/${state}/${county.toLowerCase()}`;
    const data = await getPollenData(url);

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch pollen data',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}