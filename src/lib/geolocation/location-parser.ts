/**
 * Location and Map URL Parser
 * Supports parsing coordinates in various formats (decimal, DMS, labeled)
 * and extracting coordinates from Google Maps, OpenStreetMap, Apple Maps, and Waze URLs.
 */

export type ParsedLocation = {
  latitude: number;
  longitude: number;
  source?: string;
  isShortLink?: boolean;
};

export type ParseLocationResult = {
  type: "coordinates" | "map_url" | "short_url" | "unknown";
  latitude?: number;
  longitude?: number;
  source?: string;
  url?: string;
};

/**
 * Validates whether latitude and longitude are within standard geographical ranges.
 */
export function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * Converts Degrees, Minutes, Seconds (DMS) string components to decimal degrees.
 */
function dmsToDecimal(degrees: number, minutes: number, seconds: number, direction: string): number {
  let decimal = degrees + minutes / 60 + seconds / 3600;
  const dir = direction.toUpperCase();
  if (dir === "S" || dir === "W") {
    decimal = -decimal;
  }
  return Number(decimal.toFixed(7));
}

/**
 * Parses raw text containing coordinates in various formats:
 * - Decimal: `-26.2041, 28.0473` or `-26.2041 28.0473`
 * - Labeled: `lat: -26.2041, lon: 28.0473`
 * - Cardinal notation: `26.2041° S, 28.0473° E` or `S 26.2041, E 28.0473`
 * - DMS: `26°12'14.8"S 28°02'50.3"E` or `26 12 14.8 S, 28 2 50.3 E`
 */
export function parseCoordinates(rawInput: string): { latitude: number; longitude: number } | null {
  if (!rawInput || typeof rawInput !== "string") return null;
  const input = rawInput.trim();

  // 1. Labeled coordinates: lat: -26.2041, lng/lon: 28.0473
  const labeledRegex = /(?:lat(?:itude)?[:=\s]+)([-+]?\d+(?:\.\d+)?)[,\s]+(?:lon(?:gitude)?|lng)[:=\s]+([-+]?\d+(?:\.\d+)?)/i;
  const labeledMatch = input.match(labeledRegex);
  if (labeledMatch) {
    const lat = Number(labeledMatch[1]);
    const lon = Number(labeledMatch[2]);
    if (isValidCoordinate(lat, lon)) {
      return { latitude: Number(lat.toFixed(7)), longitude: Number(lon.toFixed(7)) };
    }
  }

  // 2. Degrees Minutes Seconds (DMS): e.g. 26°12'14.8"S 28°02'50.3"E or 26° 12' 14.8" S, 28° 02' 50.3" E
  const dmsRegex = /(\d{1,2})[°\s]+(\d{1,2})['\s]+(\d+(?:\.\d+)?)["\s]*([NSEWnsew])[,\s]+(\d{1,3})[°\s]+(\d{1,2})['\s]+(\d+(?:\.\d+)?)["\s]*([NSEWnsew])/;
  const dmsMatch = input.match(dmsRegex);
  if (dmsMatch) {
    const lat = dmsToDecimal(Number(dmsMatch[1]), Number(dmsMatch[2]), Number(dmsMatch[3]), dmsMatch[4]);
    const lon = dmsToDecimal(Number(dmsMatch[5]), Number(dmsMatch[6]), Number(dmsMatch[7]), dmsMatch[8]);
    if (isValidCoordinate(lat, lon)) {
      return { latitude: lat, longitude: lon };
    }
  }

  // 3. Cardinal with decimal degrees: e.g. 26.2041° S, 28.0473° E or S26.2041, E28.0473
  const cardinalRegex = /([NSEWnsew])?\s*(\d+(?:\.\d+)?)[°\s]*([NSEWnsew])?[,\s]+([NSEWnsew])?\s*(\d+(?:\.\d+)?)[°\s]*([NSEWnsew])?/;
  const cardMatch = input.match(cardinalRegex);
  if (cardMatch) {
    const dir1 = (cardMatch[1] || cardMatch[3] || "").toUpperCase();
    const val1 = Number(cardMatch[2]);
    const dir2 = (cardMatch[4] || cardMatch[6] || "").toUpperCase();
    const val2 = Number(cardMatch[5]);

    if (dir1 && dir2) {
      const lat = (dir1 === "S" || dir1 === "N") ? (dir1 === "S" ? -val1 : val1) : (dir2 === "S" ? -val2 : val2);
      const lon = (dir1 === "E" || dir1 === "W") ? (dir1 === "W" ? -val1 : val1) : (dir2 === "W" ? -val2 : val2);
      if (isValidCoordinate(lat, lon)) {
        return { latitude: Number(lat.toFixed(7)), longitude: Number(lon.toFixed(7)) };
      }
    }
  }

  // 4. Standard decimal pair: e.g. -26.204100, 28.047300 or (-26.2041, 28.0473)
  const decimalRegex = /^[\s(]*([-+]?\d{1,2}(?:\.\d+)?)[,\s]+([-+]?\d{1,3}(?:\.\d+)?)[\s)]*$/;
  const decMatch = input.match(decimalRegex);
  if (decMatch) {
    const lat = Number(decMatch[1]);
    const lon = Number(decMatch[2]);
    if (isValidCoordinate(lat, lon)) {
      return { latitude: Number(lat.toFixed(7)), longitude: Number(lon.toFixed(7)) };
    }
  }

  return null;
}

/**
 * Checks if a string looks like a map or web URL.
 */
export function isMapUrl(input: string): boolean {
  if (!input || typeof input !== "string") return false;
  const str = input.trim().toLowerCase();
  return (
    str.startsWith("http://") ||
    str.startsWith("https://") ||
    str.startsWith("maps.app.goo.gl") ||
    str.startsWith("goo.gl/maps") ||
    str.startsWith("maps.google.com")
  );
}

/**
 * Checks whether a URL is a known short URL service (like Google Maps short link).
 */
export function isShortMapUrl(urlStr: string): boolean {
  if (!urlStr) return false;
  const lower = urlStr.toLowerCase();
  return (
    lower.includes("maps.app.goo.gl") ||
    lower.includes("goo.gl/maps") ||
    lower.includes("bit.ly") ||
    lower.includes("tinyurl.com")
  );
}

/**
 * Extracts coordinates from known map provider URLs:
 * - Google Maps (standard, place, search, directions)
 * - OpenStreetMap
 * - Apple Maps
 * - Waze
 */
export function parseMapUrl(rawUrl: string): ParsedLocation | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const url = rawUrl.trim();

  // If it's a short link, flag it so caller knows it requires server-side redirect resolution
  if (isShortMapUrl(url)) {
    return {
      latitude: 0,
      longitude: 0,
      source: "google_maps_short",
      isShortLink: true,
    };
  }

  // 1. Google Maps: /@(-26.204100),(28.047300),17z
  const gmapsAtMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (gmapsAtMatch) {
    const lat = Number(gmapsAtMatch[1]);
    const lon = Number(gmapsAtMatch[2]);
    if (isValidCoordinate(lat, lon)) {
      return { latitude: Number(lat.toFixed(7)), longitude: Number(lon.toFixed(7)), source: "google_maps" };
    }
  }

  // 2. Google Maps / Apple Maps / OSM query param: q=lat,lon or query=lat,lon or ll=lat,lon or daddr=lat,lon
  const queryParamMatch = url.match(/[?&](?:q|query|ll|sll|daddr)=(-?\d+\.\d+)[,+%20\s]+(-?\d+\.\d+)/i);
  if (queryParamMatch) {
    const lat = Number(queryParamMatch[1]);
    const lon = Number(queryParamMatch[2]);
    if (isValidCoordinate(lat, lon)) {
      return { latitude: Number(lat.toFixed(7)), longitude: Number(lon.toFixed(7)), source: "query_param" };
    }
  }

  // 3. OpenStreetMap: #map=zoom/lat/lon or ?mlat=lat&mlon=lon
  const osmHashMatch = url.match(/#map=\d+\/(-?\d+\.\d+)\/(-?\d+\.\d+)/);
  if (osmHashMatch) {
    const lat = Number(osmHashMatch[1]);
    const lon = Number(osmHashMatch[2]);
    if (isValidCoordinate(lat, lon)) {
      return { latitude: Number(lat.toFixed(7)), longitude: Number(lon.toFixed(7)), source: "openstreetmap" };
    }
  }

  const osmMlatMatch = url.match(/[?&]mlat=(-?\d+\.\d+)&mlon=(-?\d+\.\d+)/);
  if (osmMlatMatch) {
    const lat = Number(osmMlatMatch[1]);
    const lon = Number(osmMlatMatch[2]);
    if (isValidCoordinate(lat, lon)) {
      return { latitude: Number(lat.toFixed(7)), longitude: Number(lon.toFixed(7)), source: "openstreetmap" };
    }
  }

  // 4. Waze: ll=lat,lon or to=ll.lat,lon
  const wazeMatch = url.match(/to=ll\.(-?\d+\.\d+)%2C(-?\d+\.\d+)/i);
  if (wazeMatch) {
    const lat = Number(wazeMatch[1]);
    const lon = Number(wazeMatch[2]);
    if (isValidCoordinate(lat, lon)) {
      return { latitude: Number(lat.toFixed(7)), longitude: Number(lon.toFixed(7)), source: "waze" };
    }
  }

  return null;
}

/**
 * High-level detection helper:
 * Determines whether raw input is a direct coordinate string, a map URL, a short link, or standard text.
 */
export function parseLocationInput(rawInput: string): ParseLocationResult {
  if (!rawInput || typeof rawInput !== "string") {
    return { type: "unknown" };
  }

  const input = rawInput.trim();

  // Try parsing coordinates first
  const coords = parseCoordinates(input);
  if (coords) {
    return {
      type: "coordinates",
      latitude: coords.latitude,
      longitude: coords.longitude,
    };
  }

  // Check if it's a URL
  if (isMapUrl(input)) {
    if (isShortMapUrl(input)) {
      return {
        type: "short_url",
        url: input,
      };
    }

    const mapLocation = parseMapUrl(input);
    if (mapLocation && !mapLocation.isShortLink) {
      return {
        type: "map_url",
        latitude: mapLocation.latitude,
        longitude: mapLocation.longitude,
        source: mapLocation.source,
        url: input,
      };
    }
  }

  return { type: "unknown" };
}
