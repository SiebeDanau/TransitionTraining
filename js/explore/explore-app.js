import {
  loadRepository,
  featuresToGeoJson,
} from "../shared/data-repository.js";
import { createSearchIndex } from "../shared/search-index.js";

const BLANK_STYLE = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#f7f6f1" },
    },
  ],
};
const OSM_STYLE = "https://tiles.openfreemap.org/styles/bright";
const COLORS = {
  "fir-uir": "#222222",
  tma: "#2563eb",
  "restricted-areas": "#d62728",
  "military-areas": "#8b5cf6",
  "sporting-areas": "#d97706",
  "significant-points": "#d62728",
  "radio-navigation-aids": "#7c3aed",
  aerodromes: "#087f5b",
};
const state = {
  repository: null,
  map: null,
  search: null,
  featuresByKey: new Map(),
  filterNodes: new Map(),
  featurePaths: new Map(),
  filterOverrides: {},
  roles: new Set(),
  hovered: [],
  selected: null,
  background: localStorage.getItem("explore.background") || "osm",
  activeSearchIndex: -1,
};
const $ = (selector) => document.querySelector(selector);
const els = {
  datasets: $("#datasetFilters"),
  roles: $("#roleFilters"),
  status: $("#status"),
  search: $("#searchInput"),
  results: $("#searchResults"),
  details: $("#detailPanel"),
  detailContent: $("#detailContent"),
  candidates: $("#candidatePanel"),
  candidateIntro: $("#candidateIntro"),
  candidateList: $("#candidateList"),
  closeCandidates: $("#closeCandidates"),
  hover: $("#hoverCard"),
  background: $("#backgroundMode"),
};

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
}
function loadSet(key, defaults) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return new Set(Array.isArray(value) ? value : defaults);
  } catch {
    return new Set(defaults);
  }
}
function savePreferences() {
  localStorage.setItem(
    "explore.filterOverrides",
    JSON.stringify(state.filterOverrides),
  );
  localStorage.setItem("explore.roles", JSON.stringify([...state.roles]));
}
function featureSubtitle(feature) {
  const p = feature.properties;
  const vertical =
    [p.lowerLimit, p.upperLimit].filter(Boolean).join(" / ");
  return [feature.typeLabel, vertical, p.station, p.type]
    .filter(Boolean)
    .join(" · ");
}

function titleCase(value) {
  return String(value)
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/Tma\b/g, "TMA")
    .replace(/Fir\b/g, "FIR")
    .replace(/Uir\b/g, "UIR");
}
function groupLabel(dataset, file, features) {
  if (dataset.groupBy) {
    const value = features[0]?.properties?.[dataset.groupBy];
    return dataset.groupLabels?.[value] || titleCase(value);
  }
  if (dataset.id === "tma") return titleCase(file.split("/").pop());
  if (dataset.kind === "point")
    return titleCase(
      file
        .split("/")
        .pop()
        .replace(/^.*-(?=[^-]+\.json$)/, ""),
    );
  if (features.length === 1) return features[0].title;
  return titleCase(file.split("/").pop());
}
function groupKey(dataset, feature) {
  if (dataset.groupBy)
    return `${dataset.groupBy}:${feature.properties?.[dataset.groupBy] || "other"}`;
  if (dataset.id === "tma")
    return feature.sourceFile.split("/").slice(0, -1).join("/");
  return feature.sourceFile;
}
function buildFilterTree() {
  state.filterNodes.clear();
  state.featurePaths.clear();
  state.repository.datasets.forEach((dataset) => {
    const datasetId = `d:${dataset.id}`;
    const datasetFeatures = state.repository.features.filter(
      (feature) => feature.datasetId === dataset.id,
    );
    state.filterNodes.set(datasetId, {
      id: datasetId,
      label: dataset.label,
      features: datasetFeatures,
      dataset,
      level: "dataset",
    });
    const byFile = new Map();
    datasetFeatures.forEach((feature) => {
      const key = groupKey(dataset, feature);
      if (!byFile.has(key)) byFile.set(key, []);
      byFile.get(key).push(feature);
    });
    [...byFile].forEach(([file, features]) => {
      const groupId = `${datasetId}/g:${file}`;
      state.filterNodes.set(groupId, {
        id: groupId,
        label: groupLabel(dataset, file, features),
        features,
        dataset,
        level: "group",
      });
      features.forEach((feature) => {
        const featureId = `${groupId}/f:${feature.key}`;
        state.filterNodes.set(featureId, {
          id: featureId,
          label: feature.title,
          features: [feature],
          dataset,
          level: "feature",
        });
        state.featurePaths.set(feature.key, [datasetId, groupId, featureId]);
      });
    });
  });
}
function isFeatureEnabled(feature) {
  const dataset = state.repository.datasets.find(
    (item) => item.id === feature.datasetId,
  );
  let enabled = Boolean(dataset?.defaultVisible);
  if (dataset?.filterable === false) return enabled;
  (state.featurePaths.get(feature.key) || []).forEach((nodeId) => {
    if (Object.prototype.hasOwnProperty.call(state.filterOverrides, nodeId))
      enabled = state.filterOverrides[nodeId];
  });
  return enabled;
}
function nodeState(node) {
  const enabled = node.features.filter(isFeatureEnabled).length;
  return {
    checked: enabled === node.features.length && enabled > 0,
    indeterminate: enabled > 0 && enabled < node.features.length,
  };
}
function filterCheckbox(node, summary = false) {
  const status = nodeState(node);
  const input = `<input type="checkbox" data-filter-node="${escapeHtml(node.id)}" aria-label="${escapeHtml(`${node.label} tonen`)}" ${status.checked ? "checked" : ""}>`;
  if (summary)
    return `<span class="filter-summary-label">${escapeHtml(node.label)} <span class="filter-count">${node.features.length}</span></span><label class="filter-summary-toggle" title="Zichtbaarheid van deze hele groep wijzigen">${input}</label>`;
  return `<label class="filter filter-leaf">${input}<span>${escapeHtml(node.label)}</span></label>`;
}
function roleRelevantFeatures(dataset, features) {
  if (!dataset.roleFilterable) return features;
  const allowed = allowedFeatureIds(dataset.id);
  return allowed
    ? features.filter((feature) => allowed.has(feature.canonicalId))
    : features;
}
function menuNode(node) {
  return {
    ...node,
    features: roleRelevantFeatures(node.dataset, node.features),
  };
}
function renderDatasetFilter(dataset) {
  const datasetId = `d:${dataset.id}`,
    datasetNode = menuNode(state.filterNodes.get(datasetId));
  if (!datasetNode.features.length) return "";
  const leaves = datasetNode.features
    .sort((a, b) => a.title.localeCompare(b.title, "nl"))
    .map((feature) =>
      filterCheckbox(
        state.filterNodes.get(state.featurePaths.get(feature.key)[2]),
      ),
    )
    .join("");
  const groups = [...state.filterNodes.values()]
    .filter(
      (node) => node.level === "group" && node.id.startsWith(`${datasetId}/`),
    )
    .map(menuNode)
    .filter((node) => node.features.length)
    .sort((a, b) => a.label.localeCompare(b.label, "nl"));
  const children = dataset.flattenGroups
    ? leaves
    : groups
        .map(
          (group) =>
            `<details class="filter-node"><summary>${filterCheckbox(group, true)}</summary><div class="filter-children">${group.features
              .sort((a, b) => a.title.localeCompare(b.title, "nl"))
              .map((feature) =>
                filterCheckbox(
                  state.filterNodes.get(state.featurePaths.get(feature.key)[2]),
                ),
              )
              .join("")}</div></details>`,
        )
        .join("");
  return `<details class="filter-node" open><summary>${filterCheckbox(datasetNode, true)}</summary><div class="filter-children">${children}</div></details>`;
}
function renderFilters() {
  els.datasets.innerHTML = `<p class="filter-help">Enkel kaartgegevens die in de geselecteerde rol(len) zit kunnen worden aangeduid. Geen rol selecteren zal alle gegevens beschikbaar maken.</p><div class="filter-tree">${state.repository.datasets
    .filter((dataset) => dataset.filterable !== false)
    .map(renderDatasetFilter)
    .join("")}</div>`;
  els.roles.innerHTML = [...state.repository.roles]
    .sort((a, b) => a.label.localeCompare(b.label, "nl"))
    .map(
      (role) =>
        `<label class="filter"><input type="checkbox" data-role="${role.id}" ${state.roles.has(role.id) ? "checked" : ""}><span>${escapeHtml(role.label)}</span></label>`,
    )
    .join("");
  updateFilterStates();
}

function updateFilterStates() {
  els.datasets.querySelectorAll("[data-filter-node]").forEach((input) => {
    const status = nodeState(
      menuNode(state.filterNodes.get(input.dataset.filterNode)),
    );
    input.checked = status.checked;
    input.indeterminate = status.indeterminate;
  });
}
function setFilterNode(nodeId, enabled) {
  Object.keys(state.filterOverrides)
    .filter((key) => key === nodeId || key.startsWith(`${nodeId}/`))
    .forEach((key) => delete state.filterOverrides[key]);
  state.filterOverrides[nodeId] = enabled;
  updateFilterStates();
  refreshMap();
}

function allowedFeatureIds(datasetId) {
  if (!state.roles.size) return null;
  const ids = new Set();
  state.repository.roles
    .filter((role) => state.roles.has(role.id))
    .forEach((role) => {
      const category = role.categories?.[datasetId] || {};
      (category.pointIds || category.areaIds || []).forEach((id) =>
        ids.add(String(id).toUpperCase()),
      );
    });
  return ids;
}
function visibleFeatures(dataset) {
  const features = state.repository.features.filter(
    (feature) => feature.datasetId === dataset.id && isFeatureEnabled(feature),
  );
  if (!dataset.roleFilterable) return features;
  const allowed = allowedFeatureIds(dataset.id);
  return allowed
    ? features.filter((feature) => allowed.has(feature.canonicalId))
    : features;
}

function addApplicationLayers() {
  const map = state.map;
  if (!map) return;
  state.repository.datasets.forEach((dataset) => {
    const sourceId = `explore-${dataset.id}`;
    const data = featuresToGeoJson(visibleFeatures(dataset));
    if (map.getSource(sourceId)) map.getSource(sourceId).setData(data);
    else map.addSource(sourceId, { type: "geojson", data });
    const color = COLORS[dataset.id] || "#444";
    if (dataset.kind === "airspace") {
      if (dataset.interactive !== false) {
        addLayer({
          id: `${sourceId}-fill`,
          type: "fill",
          source: sourceId,
          paint: { "fill-color": color, "fill-opacity": 0.012 },
        });
        addLayer({
          id: `${sourceId}-line-hit`,
          type: "line",
          source: sourceId,
          paint: { "line-color": "rgba(0,0,0,0)", "line-width": 14 },
        });
      }
      addLayer({
        id: `${sourceId}-line`,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": ["coalesce", ["get", "color"], color],
          "line-width": dataset.id === "fir-uir" ? 3 : 2,
          "line-opacity": 0.9,
        },
      });
    } else {
      addLayer({
        id: `${sourceId}-point-hit`,
        type: "circle",
        source: sourceId,
        paint: { "circle-radius": 12, "circle-color": "rgba(0,0,0,0)" },
      });
      addLayer({
        id: `${sourceId}-point`,
        type: "circle",
        source: sourceId,
        paint: {
          "circle-radius": 5,
          "circle-color": color,
          "circle-stroke-color": "#fff",
          "circle-stroke-width": 1.5,
        },
      });
    }
  });
  if (!map.getSource("explore-highlight"))
    map.addSource("explore-highlight", {
      type: "geojson",
      data: featuresToGeoJson([]),
    });
  addLayer({
    id: "explore-highlight-fill",
    type: "fill",
    source: "explore-highlight",
    filter: ["==", ["get", "kind"], "airspace"],
    paint: { "fill-color": "#00a6b8", "fill-opacity": 0.16 },
  });
  addLayer({
    id: "explore-highlight-line",
    type: "line",
    source: "explore-highlight",
    filter: ["==", ["get", "kind"], "airspace"],
    paint: { "line-color": "#00a6b8", "line-width": 5, "line-opacity": 1 },
  });
  addLayer({
    id: "explore-highlight-point",
    type: "circle",
    source: "explore-highlight",
    filter: ["==", ["get", "kind"], "point"],
    paint: {
      "circle-radius": 11,
      "circle-color": "#00a6b8",
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 3,
    },
  });
}
function addLayer(layer) {
  if (!state.map.getLayer(layer.id)) state.map.addLayer(layer);
}
function simplifyOsm() {
  const layers = state.map?.getStyle()?.layers || [];
  layers.forEach((layer) => {
    if (layer.id.startsWith("explore-")) return;
    try {
      if (layer.type === "background") {
        state.map.setPaintProperty(layer.id, "background-color", "#f7f6f1");
        return;
      }
      const identity =
        `${layer.id} ${layer["source-layer"] || ""}`.toLowerCase();
      const keepWater =
        /(water|ocean|sea|river)/.test(identity) &&
        !/(label|name|canal|ditch|drain|stream)/.test(identity);
      const keepRiver =
        /(river)/.test(identity) && !/(label|name|small|minor)/.test(identity);
      const keepBoundary =
        /(boundary|admin)/.test(identity) &&
        /(country|national|admin-0|admin_0|admin0)/.test(identity);
      state.map.setLayoutProperty(
        layer.id,
        "visibility",
        keepWater || keepRiver || keepBoundary ? "visible" : "none",
      );
    } catch {}
  });
}
function refreshMap() {
  const count = state.repository.datasets.reduce(
    (sum, dataset) => sum + visibleFeatures(dataset).length,
    0,
  );
  els.status.textContent = `${count.toLocaleString("nl-BE")} objecten zichtbaar${state.roles.size ? ` · ${state.roles.size} rolfilter(s)` : ""}.`;
  savePreferences();
  if (!state.map?.isStyleLoaded()) return;
  addApplicationLayers();
}

function renderedCandidates(point, wide = false) {
  const layers = state.repository.datasets
    .flatMap((dataset) =>
      dataset.kind === "airspace"
        ? [`explore-${dataset.id}-fill`, `explore-${dataset.id}-line-hit`]
        : [`explore-${dataset.id}-point-hit`],
    )
    .filter((id) => state.map.getLayer(id));
  const area = wide
    ? [
        [point.x - 6, point.y - 6],
        [point.x + 6, point.y + 6],
      ]
    : point;
  const seen = new Set();
  return state.map
    .queryRenderedFeatures(area, { layers })
    .map((item) => state.featuresByKey.get(item.properties.featureKey))
    .filter(
      (feature) => feature && !seen.has(feature.key) && seen.add(feature.key),
    )
    .sort(
      (a, b) =>
        (a.kind === "point" ? -1 : 1) - (b.kind === "point" ? -1 : 1) ||
        a.size - b.size,
    );
}
function setHighlight(features) {
  state.hovered = features;
  state.map
    ?.getSource("explore-highlight")
    ?.setData(featuresToGeoJson(features));
}
function showHover(event, candidates) {
  if (!candidates.length) {
    els.hover.hidden = true;
    setHighlight(state.selected ? [state.selected] : []);
    state.map.getCanvas().style.cursor = "";
    return;
  }
  const primary = candidates[0];
  if (!state.selected && els.candidates.hidden) setHighlight([primary]);
  state.map.getCanvas().style.cursor = "pointer";
  els.hover.innerHTML = `<strong>${escapeHtml(primary.title)}</strong><span>${escapeHtml(featureSubtitle(primary))}${candidates.length > 1 ? ` · +${candidates.length - 1} andere` : ""}</span>`;
  els.hover.style.left = `${Math.min(event.point.x + 15, state.map.getContainer().clientWidth - 275)}px`;
  els.hover.style.top = `${Math.max(60, event.point.y - 5)}px`;
  els.hover.hidden = false;
}
function openCandidates(candidates) {
  state.selected = null;
  els.details.hidden = true;
  setHighlight([]);
  els.candidates.hidden = false;
  els.candidateIntro.textContent = `${candidates.length} objecten liggen op deze plaats. Beweeg over een optie om ze op de kaart te vergelijken.`;
  els.candidateList.innerHTML = "";
  candidates.forEach((feature) => {
    const button = document.createElement("button");
    button.className = "candidate";
    button.innerHTML = `<strong>${escapeHtml(feature.title)}</strong><span>${escapeHtml(featureSubtitle(feature))}</span>`;
    button.addEventListener("mouseenter", () => setHighlight([feature]));
    button.addEventListener("focus", () => setHighlight([feature]));
    button.addEventListener("click", () => selectFeature(feature));
    els.candidateList.append(button);
  });
}
function closeCandidateMenu() {
  els.candidates.hidden = true;
  els.candidateList.innerHTML = "";
  setHighlight(state.selected ? [state.selected] : []);
}
function deselectFeature() {
  state.selected = null;
  els.details.hidden = true;
  closeCandidateMenu();
  setHighlight([]);
}
function selectFeature(feature, { move = false } = {}) {
  state.selected = feature;
  closeCandidateMenu();
  els.results.hidden = true;
  setHighlight([feature]);
  renderDetails(feature);
  if (move && feature.bbox) {
    const [w, s, e, n] = feature.bbox;
    if (w === e && s === n)
      state.map.flyTo({ center: feature.center, zoom: 10 });
    else
      state.map.fitBounds(
        [
          [w, s],
          [e, n],
        ],
        {
          padding: { left: 70, right: 430, top: 70, bottom: 70 },
          maxZoom: 10,
          duration: 700,
        },
      );
  }
}

const FIELD_LABELS = {
  id: "ICAO",
  title: "Full Name",
  identifier: "Identifier",
  station: "Station",
  type: "Type",
  frequency: "Frequency",
  channel: "Channel",
  hours: "Hours",
  elevation: "Elevation",
  traffic: "Traffic",
  airspaceClass: "Airspace Class",
  lowerLimit: "Lower Limit",
  upperLimit: "Upper Limit",
  verticalLimits: "Vertical Limits",
  controlUnit: "Control Unit",
  restrictionOrHazard: "Restriction or Hazard",
  timeOfActivity: "Time of Activity",
  lateralLimits: "Lateral Limits",
  remarks: "Remarks",
  effectiveDate: "Effective Date",
  amendment: "Amendment",
  aipSource: "AIP Source",
  aipPage: "AIP Page",
};
const FIELDS_BY_TYPE = {
  tma: [
    "airspaceClass",
    "lowerLimit",
    "upperLimit",
    "remarks",
  ],
  restricted: [
    "areaType",
    "lowerLimit",
    "upperLimit",
    "restrictionOrHazard",
    "timeOfActivity",
  ],
  military: [
    "areaType",
    "lowerLimit",
    "upperLimit",
    "restrictionOrHazard",
    "timeOfActivity",
  ],
  sporting: [
    "areaType",
    "lowerLimit",
    "upperLimit",
    "restrictionOrHazard",
    "timeOfActivity",
  ],
  "fir-uir": [
    "airspaceClass",
    "lowerLimit",
    "upperLimit",
    "remarks",
  ],
  "radio-navigation-aid": [
    "identifier",
    "station",
    "type",
    "remarks",
  ],
  aerodrome: ["id", "title", "type", "elevation", "traffic"],
  "significant-point": ["id"],
};
function renderDetails(feature) {
  const fields =
    FIELDS_BY_TYPE[feature.subtype] || Object.keys(feature.properties);
  const rows = fields
    .filter(
      (key) =>
        feature.properties[key] !== undefined && feature.properties[key] !== "",
    )
    .map(
      (key) =>
        `<div><dt>${escapeHtml(FIELD_LABELS[key] || key.replace(/([A-Z])/g, " $1"))}</dt><dd>${escapeHtml(Array.isArray(feature.properties[key]) ? feature.properties[key].join(", ") : feature.properties[key])}</dd></div>`,
    )
    .join("");
  els.detailContent.innerHTML = `<h2>${escapeHtml(feature.title)}</h2><span class="type-badge">${escapeHtml(feature.typeLabel)}</span><dl class="details">${rows || "<div><dd>Geen aanvullende details beschikbaar.</dd></div>"}</dl>`;
  els.details.hidden = false;
}

function renderSearchResults() {
  const results = state.search.search(els.search.value);
  state.activeSearchIndex = -1;
  if (!els.search.value.trim()) {
    els.results.hidden = true;
    return;
  }
  els.results.innerHTML = results.length
    ? results
        .map(
          (feature, index) =>
            `<button class="search-result" role="option" data-key="${escapeHtml(feature.key)}" data-index="${index}"><strong>${escapeHtml(feature.title)}</strong><span>${escapeHtml(featureSubtitle(feature))}</span></button>`,
        )
        .join("")
    : '<div class="search-result"><span>Geen resultaten gevonden</span></div>';
  els.results.hidden = false;
  els.results
    .querySelectorAll("button")
    .forEach((button) =>
      button.addEventListener("click", () =>
        selectFeature(state.featuresByKey.get(button.dataset.key), {
          move: true,
        }),
      ),
    );
}
function setActiveSearch(index) {
  const buttons = [...els.results.querySelectorAll("button")];
  if (!buttons.length) return;
  state.activeSearchIndex = (index + buttons.length) % buttons.length;
  buttons.forEach((button, i) =>
    button.classList.toggle("active", i === state.activeSearchIndex),
  );
  buttons[state.activeSearchIndex].scrollIntoView({ block: "nearest" });
}

function wireUi() {
  els.datasets.addEventListener("click", (event) => {
    if (event.target.closest(".filter-summary-toggle")) event.stopPropagation();
  });
  els.datasets.addEventListener("change", (event) => {
    const id = event.target.dataset.filterNode;
    if (id) setFilterNode(id, event.target.checked);
  });
  els.roles.addEventListener("change", (event) => {
    const id = event.target.dataset.role;
    if (!id) return;
    event.target.checked ? state.roles.add(id) : state.roles.delete(id);
    renderFilters();
    refreshMap();
  });
  $("#showAll").addEventListener("click", () => {
    state.filterOverrides = {};
    state.repository.datasets
      .filter((dataset) => dataset.filterable !== false)
      .forEach((dataset) => (state.filterOverrides[`d:${dataset.id}`] = true));
    updateFilterStates();
    refreshMap();
  });
  $("#hideAll").addEventListener("click", () => {
    state.filterOverrides = {};
    state.repository.datasets
      .filter((dataset) => dataset.filterable !== false)
      .forEach((dataset) => (state.filterOverrides[`d:${dataset.id}`] = false));
    updateFilterStates();
    refreshMap();
  });
  $("#closeDetails").addEventListener("click", deselectFeature);
  els.closeCandidates.addEventListener("click", closeCandidateMenu);
  els.search.addEventListener("input", renderSearchResults);
  els.search.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSearch(state.activeSearchIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSearch(state.activeSearchIndex - 1);
    } else if (event.key === "Enter" && state.activeSearchIndex >= 0) {
      event.preventDefault();
      els.results.querySelectorAll("button")[state.activeSearchIndex]?.click();
    } else if (event.key === "Escape") {
      els.results.hidden = true;
      if (state.selected) deselectFeature();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!els.candidates.hidden) closeCandidateMenu();
    else if (state.selected || !els.details.hidden) deselectFeature();
    else els.results.hidden = true;
  });
  els.background.value = state.background;
  els.background.addEventListener("change", () => {
    state.background = els.background.value;
    localStorage.setItem("explore.background", state.background);
    state.map.setStyle(state.background === "local" ? BLANK_STYLE : OSM_STYLE);
  });
}

function initializeMap() {
  if (!window.maplibregl) throw new Error("MapLibre kon niet geladen worden.");
  state.map = new maplibregl.Map({
    container: "map",
    style: state.background === "local" ? BLANK_STYLE : OSM_STYLE,
    center: [4.55, 50.65],
    zoom: 6.2,
    attributionControl: false,
  });
  state.map.addControl(
    new maplibregl.NavigationControl({ showCompass: false }),
    "top-right",
  );
  state.map.addControl(
    new maplibregl.AttributionControl({ compact: true }),
    "bottom-right",
  );
  const restore = () => {
    if (state.background === "osm") simplifyOsm();
    addApplicationLayers();
    refreshMap();
    if (state.selected) setHighlight([state.selected]);
  };
  state.map.on("style.load", restore);
  state.map.once("load", restore);
  window.setTimeout(() => {
    if (state.map.isStyleLoaded()) restore();
  }, 0);
  state.map.on("mousemove", (event) =>
    showHover(event, renderedCandidates(event.point, true)),
  );
  state.map.on("mouseout", () => {
    els.hover.hidden = true;
    setHighlight(state.selected ? [state.selected] : []);
  });
  state.map.on("click", (event) => {
    const candidates = renderedCandidates(event.point, true);
    els.hover.hidden = true;
    if (candidates.length === 1) selectFeature(candidates[0]);
    else if (candidates.length > 1) openCandidates(candidates);
    else deselectFeature();
  });
}

async function init() {
  try {
    state.repository = await loadRepository();
    state.repository.features.forEach((feature) =>
      state.featuresByKey.set(feature.key, feature),
    );
    try {
      state.filterOverrides =
        JSON.parse(localStorage.getItem("explore.filterOverrides")) || {};
    } catch {
      state.filterOverrides = {};
    }
    state.roles = loadSet("explore.roles", ["fic-essential"]);
    buildFilterTree();
    state.search = createSearchIndex(state.repository.features);
    renderFilters();
    wireUi();
    els.status.textContent = `${state.repository.features.length.toLocaleString("nl-BE")} objecten beschikbaar.`;
    initializeMap();
  } catch (error) {
    els.status.textContent = `Explore kon niet geladen worden: ${error.message}`;
    els.status.style.color = "#b3261e";
    console.error(error);
  }
}
init();
