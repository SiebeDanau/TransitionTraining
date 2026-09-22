import fs from 'node:fs';
import readline from 'node:readline';

const input = process.argv[2] || 'tmp/brussels-fir-model.kml';
const output = 'data/airspaces/loa/sectors.geojson';
const folders = [];
const features = [];
const abbreviationByName = {
  'East Low': 'ELS', 'East High': 'EHS', 'Huldenberg': 'HUL',
  'Luxembourg': 'LUX', 'North Low': 'NLS', 'West Low': 'WLS', 'West High': 'WHS',
  'Delta Low': 'DLS', 'Delta Middle': 'DMS', 'Delta High': 'DHS',
  'Koksy Low': 'KLS', 'Koksy High': 'KHS',
  'Luxembourg Low': 'LLS', 'Luxembourg High': 'LHS',
  'Nicky Low': 'NLS', 'Nicky High': 'NHS',
  'Olno Low': 'OLS', 'Olno High': 'OHS',
  'Ruhr Low': 'RLS', 'Ruhr Middle': 'RMS', 'Ruhr High': 'RHS',
};
let placemark = null;
let inCoordinates = false;
let coordinateText = '';
let inPolygon = false;
let polygonRings = [];

function coordinatesToRing(value) {
  const points = value.trim().split(/\s+/).map((token) => token.split(',').map(Number));
  if (points.length < 4 || points.some((point) => point.length < 3 || !point.slice(0, 3).every(Number.isFinite))) return null;
  if (new Set(points.map((point) => point[2])).size !== 1) return null; // Ignore the vertical walls.
  const ring = points.map(([lon, lat]) => [lon, lat]);
  if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) ring.push([...ring[0]]);
  return new Set(ring.map((point) => point.join(','))).size >= 3 ? { ring, altitude: points[0][2] } : null;
}

function finishPlacemark() {
  if (!placemark || folders[0] !== '3D Model' || !folders.includes('ATC Sectors')) return;
  const owner = folders.find((name) => name === 'Maastricht UAC' || name === 'Brussels ACC');
  if (!owner) return;
  const polygons = placemark.polygons.filter((polygon) => polygon.length);
  const unique = new Map();
  for (const polygon of polygons) {
    const key = JSON.stringify(polygon[0]);
    if (!unique.has(key)) unique.set(key, polygon);
  }
  if (!unique.size) return;
  const name = placemark.name;
  const baseName = name.replace(/\s*\([^()]*\)$/, '').replace(/\s+\d+$/, '');
  const suffix = name.match(/\s+(\d+)$/)?.[1] || '';
  const abbreviation = `${abbreviationByName[baseName] || baseName}${suffix}`;
  const limits = name.match(/\(([^()]*)\)$/)?.[1] || '';
  const [namedLower, namedUpper] = limits.split(/\s*\/\s*/);
  const altitudes = [...placemark.altitudes].sort((a, b) => a - b);
  const formatAltitude = (metres) => metres === 1372 ? '4500 FT AMSL' : `FL ${Math.round(metres / 0.3048 / 100)}`;
  const lowerLimit = namedLower || (altitudes.length ? formatAltitude(altitudes[0]) : null);
  const upperLimit = namedUpper || (altitudes.length ? formatAltitude(altitudes.at(-1)) : null);
  features.push({
    type: 'Feature',
    properties: {
      id: `${owner === 'Brussels ACC' ? 'BRU' : 'MUAC'}-${String(features.length + 1).padStart(3, '0')}`,
      name,
      abbreviation,
      loaPartner: 'Sectors',
      parentGroup: owner,
      sectorGroup: folders.at(-1),
      lowerLimit,
      upperLimit,
      source: 'User-provided Brussels FIR/UIR 3D Model KMZ, dated 03 OCT 2024',
      geometryNote: 'Horizontal footprint extracted from constant-altitude KML polygons; vertical wall polygons omitted.',
    },
    geometry: unique.size === 1
      ? { type: 'Polygon', coordinates: [...unique.values()][0] }
      : { type: 'MultiPolygon', coordinates: [...unique.values()] },
  });
}

const stream = readline.createInterface({ input: fs.createReadStream(input, 'utf8'), crlfDelay: Infinity });
for await (const line of stream) {
  const trimmed = line.trim();
  if (trimmed === '<Folder>') folders.push('');
  else if (trimmed === '</Folder>') folders.pop();
  else if (trimmed === '<Placemark>') placemark = { name: '', polygons: [], altitudes: new Set() };
  else if (trimmed === '</Placemark>') { finishPlacemark(); placemark = null; }
  else if (trimmed.startsWith('<name>') && trimmed.endsWith('</name>')) {
    const name = trimmed.slice(6, -7);
    if (placemark) placemark.name = name;
    else if (folders.length) folders[folders.length - 1] = name;
  } else if (placemark) {
    if (trimmed === '<Polygon>') { inPolygon = true; polygonRings = []; }
    else if (trimmed === '</Polygon>') { if (polygonRings.length) placemark.polygons.push(polygonRings); inPolygon = false; }
    else if (trimmed === '<coordinates>') { inCoordinates = true; coordinateText = ''; }
    else if (trimmed === '</coordinates>') {
      if (inPolygon) {
        const ring = coordinatesToRing(coordinateText);
        if (ring) { polygonRings.push(ring.ring); placemark.altitudes.add(ring.altitude); }
      }
      inCoordinates = false;
    } else if (inCoordinates) coordinateText += ` ${trimmed}`;
  }
}
fs.writeFileSync(output, JSON.stringify({ type: 'FeatureCollection', name: 'LoA — Sectors', features }, null, 2) + '\n');
console.log(`${features.length} sectors imported: ${Object.entries(Object.groupBy(features, (f) => f.properties.parentGroup)).map(([key, values]) => `${key}: ${values.length}`).join(', ')}`);
for (const feature of features) console.log(`${feature.properties.parentGroup} | ${feature.properties.sectorGroup} | ${feature.properties.name} | ${feature.geometry.type}`);
