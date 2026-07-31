export function parseCoordinate(value) {
  if (typeof value === "number") return value;
  const match = String(value || "").trim().toUpperCase().match(/^(\d{2,3})(\d{2})(\d{2}(?:\.\d+)?)([NSEW])$/);
  if (!match) return Number.NaN;
  const sign = /[SW]/.test(match[4]) ? -1 : 1;
  return sign * (Number(match[1]) + Number(match[2]) / 60 + Number(match[3]) / 3600);
}

export async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} kon niet geladen worden (${response.status}).`);
  return response.json();
}

function visitCoordinates(value, visitor) {
  if (Array.isArray(value) && typeof value[0] === "number") visitor(value);
  else if (Array.isArray(value)) value.forEach((child) => visitCoordinates(child, visitor));
}

function geometryMetrics(geometry) {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  visitCoordinates(geometry?.coordinates, ([lon, lat]) => {
    west = Math.min(west, lon); south = Math.min(south, lat);
    east = Math.max(east, lon); north = Math.max(north, lat);
  });
  const valid = Number.isFinite(west);
  return {
    bbox: valid ? [west, south, east, north] : null,
    center: valid ? [(west + east) / 2, (south + north) / 2] : null,
    size: valid ? Math.abs((east - west) * (north - south)) : Infinity,
  };
}

function normalizeGeoJson(dataset, collection, file, fileIndex) {
  return (collection.features || []).map((source, featureIndex) => {
    const properties = { ...(source.properties || {}) };
    const id = String(properties.id || source.id || properties.name || `${fileIndex}-${featureIndex}`);
    const metrics = geometryMetrics(source.geometry);
    return {
      key: `${dataset.id}:${fileIndex}:${id}:${featureIndex}`,
      canonicalId:id.trim().toUpperCase(),datasetId:dataset.id,kind:dataset.kind,subtype:dataset.subtype,
      typeLabel: dataset.typeLabel, title: properties.name || collection.name || id,
      properties, geometry: source.geometry, bbox: metrics.bbox, center: metrics.center,
      size: metrics.size, sourceFile: file,
    };
  });
}

function normalizePoints(dataset, collection, file, fileIndex) {
  return (collection.points || []).flatMap((record, featureIndex) => {
    const lat = parseCoordinate(record.lat), lon = parseCoordinate(record.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const id = String(record.id || record.name || record.title || featureIndex).trim().toUpperCase();
    return [{
      key: `${dataset.id}:${id}:${fileIndex}:${featureIndex}`,
      canonicalId: id, datasetId: dataset.id, kind: dataset.kind, subtype: dataset.subtype,
      typeLabel: dataset.typeLabel, title: record.title || record.name || id,
      properties: { ...record, id }, geometry: { type: "Point", coordinates: [lon, lat] },
      bbox: [lon, lat, lon, lat], center: [lon, lat], size: 0, sourceFile: file,
    }];
  });
}

function preferBelgianAip(features) {
  const isBelgian = (feature) => feature.sourceFile.toLowerCase().endsWith("-belgium.json");
  const belgianKeys = new Set(features
    .filter((feature) => feature.kind === "point" && isBelgian(feature))
    .map((feature) => `${feature.datasetId}:${feature.canonicalId}`));
  return features.filter((feature) => {
    if (feature.kind !== "point") return true;
    const key = `${feature.datasetId}:${feature.canonicalId}`;
    return !belgianKeys.has(key) || isBelgian(feature);
  });
}

export async function loadRepository() {
  const [catalog, roleConfig] = await Promise.all([fetchJson("data/catalog.json"), fetchJson("data/roles.json")]);
  const datasets = catalog.datasets || [];
  const jobs = datasets.flatMap((dataset) => dataset.files.map((file, fileIndex) => ({ dataset, file, fileIndex })));
  const collections = [];
  const batchSize = 8;
  for (let start = 0; start < jobs.length; start += batchSize) {
    const batch = jobs.slice(start, start + batchSize);
    collections.push(...await Promise.all(batch.map((job) => fetchJson(`data/${job.file}`))));
  }
  const features = preferBelgianAip(jobs.flatMap((job, index) => job.dataset.format === "geojson"
    ? normalizeGeoJson(job.dataset, collections[index], job.file, job.fileIndex)
    : normalizePoints(job.dataset, collections[index], job.file, job.fileIndex)));
  return { datasets, features, roles: roleConfig.roles || [] };
}

export function featuresToGeoJson(features) {
  return { type: "FeatureCollection", features: features.map((feature) => ({
    type: "Feature", id: feature.key, geometry: feature.geometry,
    properties: { featureKey: feature.key, datasetId: feature.datasetId, kind: feature.kind, subtype: feature.subtype,
      title: feature.title, typeLabel: feature.typeLabel, size: feature.size },
  })) };
}
