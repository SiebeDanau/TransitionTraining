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

const OSM_STYLE_URL = "https://tiles.openfreemap.org/styles/bright";

const state = {
  points: [],
  remainingPoints: [],
  wrongPoints: [],
  currentQuestion: null,
  svgText: "",
  fileName: "",
  correct: 0,
  wrong: 0,
  streak: 0,
  answered: false,
  allowedPointIds: new Set(),
  map: null,
  imageUrl: "",
  imageCoordinates: null,
  backgroundMode: localStorage.getItem("mapBackgroundMode") || "local",
};

const hideObjectsEl = document.querySelector("#hideObjects");
const backgroundModeEl = document.querySelector("#backgroundMode");
const mapCanvasEl = document.querySelector("#mapCanvas");
const mapNoteEl = document.querySelector("#mapNote");
const promptEl = document.querySelector("#prompt");
const feedbackEl = document.querySelector("#feedback");
const correctCountEl = document.querySelector("#correctCount");
const wrongCountEl = document.querySelector("#wrongCount");
const streakCountEl = document.querySelector("#streakCount");
const progressCountEl = document.querySelector("#progressCount");
const nextButton = document.querySelector("#nextButton");
const revealButton = document.querySelector("#revealButton");
const resetButton = document.querySelector("#resetButton");
const retryButton = document.querySelector("#retryButton");
const moduleConfig = JSON.parse(localStorage.getItem("activeModule"));
const activeRole = JSON.parse(localStorage.getItem("activeRole"));

backgroundModeEl.value = state.backgroundMode;

function setTitle() {
  if (!moduleConfig) return;
  document.title = moduleConfig.title;
  document.getElementById("pageTitle").textContent = moduleConfig.title;
  if (activeRole) {
    document.getElementById("pageIntro").textContent = `Rol: ${activeRole.label}`;
  }
}

setTitle();

function number(value) {
  return Number.parseFloat(String(value ?? "").replace(",", "."));
}

function normalizePointId(value) {
  return String(value || "").trim().toUpperCase();
}

function readViewBox(svg) {
  const value = svg.documentElement.getAttribute("viewBox");
  if (value) {
    const values = value.split(/[,\s]+/).filter(Boolean).map(number);
    if (values.length === 4) return values;
  }
  return [
    0,
    0,
    number(svg.documentElement.getAttribute("width")) || 1586.6667,
    number(svg.documentElement.getAttribute("height")) || 1121.3333,
  ];
}

function readPoints(svg) {
  return Array.from(svg.querySelectorAll('[data-geo-svg-tool="object"]'))
    .map((object, index) => {
      const label =
        object.getAttribute("data-title") ||
        object.querySelector("title")?.textContent.trim();
      const lat = number(object.getAttribute("data-lat"));
      const lon = number(object.getAttribute("data-lon"));
      if (!label || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return {
        id: `point-${index}`,
        label,
        lat,
        lon,
        status: "idle",
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label));
}

function readReferences(svg) {
  return Array.from(svg.querySelectorAll('[data-geo-svg-tool="reference"]'))
    .map((reference) => ({
      x: number(reference.getAttribute("data-x")),
      y: number(reference.getAttribute("data-y")),
      lat: number(reference.getAttribute("data-lat")),
      lon: number(reference.getAttribute("data-lon")),
    }))
    .filter((reference) =>
      [reference.x, reference.y, reference.lat, reference.lon].every(Number.isFinite)
    );
}

function solveLinear3(matrix, values) {
  const rows = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    if (Math.abs(divisor) < 1e-12) return null;
    for (let item = column; item < 4; item += 1) rows[column][item] /= divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let item = column; item < 4; item += 1) {
        rows[row][item] -= factor * rows[column][item];
      }
    }
  }
  return rows.map((row) => row[3]);
}

function fitAffine(references, property) {
  const normal = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const target = [0, 0, 0];
  references.forEach((reference) => {
    const terms = [reference.x, reference.y, 1];
    for (let row = 0; row < 3; row += 1) {
      target[row] += terms[row] * reference[property];
      for (let column = 0; column < 3; column += 1) {
        normal[row][column] += terms[row] * terms[column];
      }
    }
  });
  return solveLinear3(normal, target);
}

function imageCoordinatesFromReferences(svg, points) {
  const [minX, minY, width, height] = readViewBox(svg);
  const references = readReferences(svg);
  if (references.length >= 3) {
    const lonCoefficients = fitAffine(references, "lon");
    const latCoefficients = fitAffine(references, "lat");
    if (lonCoefficients && latCoefficients) {
      const project = (x, y) => [
        lonCoefficients[0] * x + lonCoefficients[1] * y + lonCoefficients[2],
        latCoefficients[0] * x + latCoefficients[1] * y + latCoefficients[2],
      ];
      return [
        project(minX, minY),
        project(minX + width, minY),
        project(minX + width, minY + height),
        project(minX, minY + height),
      ];
    }
  }

  const lons = points.map((point) => point.lon);
  const lats = points.map((point) => point.lat);
  const west = Math.min(...lons) - 0.5;
  const east = Math.max(...lons) + 0.5;
  const south = Math.min(...lats) - 0.35;
  const north = Math.max(...lats) + 0.35;
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ];
}

function makeBackgroundSvg(svgText) {
  const svg = new DOMParser().parseFromString(svgText, "image/svg+xml");
  svg.querySelectorAll('[data-geo-svg-tool="object"]').forEach((object) => {
    object.setAttribute("display", "none");
  });
  svg.querySelectorAll('[data-geo-svg-tool="object-label"]').forEach((label) => {
    label.setAttribute("display", "none");
  });
  return new XMLSerializer().serializeToString(svg);
}

function pointGeoJson() {
  return {
    type: "FeatureCollection",
    features: state.points.map((point) => ({
      type: "Feature",
      id: point.id,
      properties: {
        id: point.id,
        label: point.label,
        status: point.status,
      },
      geometry: {
        type: "Point",
        coordinates: [point.lon, point.lat],
      },
    })),
  };
}

function updatePointSource() {
  const source = state.map?.getSource("training-points");
  if (source) source.setData(pointGeoJson());
}

function addTrainingLayers() {
  const map = state.map;
  if (!map || !map.isStyleLoaded()) return;

  if (state.backgroundMode === "local" && state.imageUrl && state.imageCoordinates) {
    map.addSource("local-map", {
      type: "image",
      url: state.imageUrl,
      coordinates: state.imageCoordinates,
    });
    map.addLayer({
      id: "local-map",
      type: "raster",
      source: "local-map",
      paint: { "raster-opacity": 1, "raster-fade-duration": 0 },
    });
  }

  map.addSource("training-points", {
    type: "geojson",
    data: pointGeoJson(),
  });

  map.addLayer({
    id: "training-points",
    type: "circle",
    source: "training-points",
    layout: {
      visibility: hideObjectsEl.checked ? "none" : "visible",
    },
    paint: {
      "circle-radius": [
        "case",
        ["==", ["get", "status"], "idle"],
        4.5,
        10,
      ],
      "circle-color": [
        "match",
        ["get", "status"],
        "correct",
        "#167847",
        "incorrect",
        "#b3261e",
        "reveal",
        "#ffffff",
        "#d62728",
      ],
      "circle-stroke-color": [
        "match",
        ["get", "status"],
        "correct",
        "#0b5d36",
        "incorrect",
        "#7d1712",
        "reveal",
        "#167847",
        "#ffffff",
      ],
      "circle-stroke-width": [
        "case",
        ["==", ["get", "status"], "idle"],
        1.5,
        4,
      ],
    },
  });

  map.addLayer({
    id: "training-hit-area",
    type: "circle",
    source: "training-points",
    paint: {
      "circle-radius": 15,
      "circle-opacity": 0,
      "circle-stroke-opacity": 0,
    },
  });
}

function simplifyOsmStyle() {
  const map = state.map;
  const layers = map?.getStyle()?.layers || [];
  layers.forEach((layer) => {
    if (layer.type === "background") {
      map.setPaintProperty(layer.id, "background-color", "#f7f6f1");
      return;
    }
    const identity = `${layer.id} ${layer["source-layer"] || ""}`.toLowerCase();
    const keepWater =
      /(water|ocean|sea|river)/.test(identity) &&
      !/(label|name|canal|ditch|drain|stream)/.test(identity);
    const keepRiver =
      /(river)/.test(identity) && !/(label|name|small|minor)/.test(identity);
    const keepBoundary =
      /(boundary|admin)/.test(identity) &&
      /(country|national|admin-0|admin_0|admin0)/.test(identity);
    map.setLayoutProperty(
      layer.id,
      "visibility",
      keepWater || keepRiver || keepBoundary ? "visible" : "none"
    );
  });
}

function fitMapToData() {
  if (!state.map || state.points.length === 0) return;
  const bounds = new maplibregl.LngLatBounds();
  state.points.forEach((point) => bounds.extend([point.lon, point.lat]));
  state.map.fitBounds(bounds, { padding: 54, duration: 0, maxZoom: 7.4 });
}

function applyBackground(mode, preserveView = true) {
  if (!state.map) return;
  const center = state.map.getCenter();
  const zoom = state.map.getZoom();
  state.backgroundMode = mode;
  localStorage.setItem("mapBackgroundMode", mode);
  mapNoteEl.textContent =
    mode === "local"
      ? "De bestaande rustige trainingskaart blijft behouden."
      : "Alleen land, water, grote rivieren en landsgrenzen blijven zichtbaar.";

  state.map.setStyle(mode === "local" ? BLANK_STYLE : OSM_STYLE_URL);
  state.map.once("style.load", () => {
    if (mode === "osm") simplifyOsmStyle();
    addTrainingLayers();
    if (preserveView) state.map.jumpTo({ center, zoom });
    else fitMapToData();
  });
}

function initializeMap() {
  if (!window.maplibregl) {
    mapCanvasEl.className = "map-error";
    mapCanvasEl.textContent =
      "De interactieve kaart kon niet geladen worden. Controleer de internetverbinding.";
    throw new Error("MapLibre kon niet geladen worden.");
  }

  state.map = new maplibregl.Map({
    container: "mapCanvas",
    style: state.backgroundMode === "local" ? BLANK_STYLE : OSM_STYLE_URL,
    center: [4.55, 50.65],
    zoom: 6.2,
    attributionControl: false,
  });
  state.map.addControl(
    new maplibregl.NavigationControl({ showCompass: false }),
    "top-right"
  );
  state.map.addControl(
    new maplibregl.AttributionControl({ compact: true }),
    "bottom-right"
  );

  state.map.on("load", () => {
    if (state.backgroundMode === "osm") simplifyOsmStyle();
    addTrainingLayers();
    fitMapToData();
  });

  state.map.on("click", "training-hit-area", (event) => {
    const id = event.features?.[0]?.properties?.id;
    const point = state.points.find((candidate) => candidate.id === id);
    if (point) checkAnswer(point);
  });
  state.map.on("mouseenter", "training-hit-area", () => {
    state.map.getCanvas().style.cursor = "pointer";
  });
  state.map.on("mouseleave", "training-hit-area", () => {
    state.map.getCanvas().style.cursor = "";
  });
}

async function initMap() {
  if (!moduleConfig || moduleConfig.type !== "map" || !activeRole) {
    window.location.href = "index.html";
    return;
  }

  try {
    const [mapResponse, roleResponse] = await Promise.all([
      fetch(`maps/${moduleConfig.map}`),
      fetch("data/roles.json", { cache: "no-store" }),
    ]);
    if (!mapResponse.ok || !roleResponse.ok) {
      throw new Error("Kaart of rollenbestand kon niet geladen worden.");
    }

    const [svgText, roleConfig] = await Promise.all([
      mapResponse.text(),
      roleResponse.json(),
    ]);
    const role = roleConfig.roles?.find((item) => item.id === activeRole.id);
    const categoryAliases = {
      "radio-navigation-points": "radio-navigation-aids",
    };
    const category =
      role?.categories?.[moduleConfig.id] ||
      role?.categories?.[categoryAliases[moduleConfig.id]];
    state.allowedPointIds = new Set(
      (category?.pointIds || []).map(normalizePointId)
    );
    loadSvgText(svgText, moduleConfig.map);
  } catch (error) {
    promptEl.textContent = "Module kon niet geladen worden";
    setFeedback(error.message, "bad");
    setControlsEnabled(false);
  }
}

function clearMarks() {
  state.points.forEach((point) => {
    point.status = "idle";
  });
  updatePointSource();
}

function updateStats() {
  correctCountEl.textContent = String(state.correct);
  wrongCountEl.textContent = String(state.wrong);
  streakCountEl.textContent = String(state.streak);
  const total = state.points.length;
  const answered =
    total - state.remainingPoints.length - (state.currentQuestion ? 1 : 0);
  progressCountEl.textContent = `${answered} / ${total}`;
}

function setFeedback(text, type = "") {
  feedbackEl.textContent = text;
  feedbackEl.className = type ? `feedback ${type}` : "feedback";
}

function setControlsEnabled(enabled) {
  nextButton.disabled = !enabled;
  revealButton.disabled = !enabled;
  resetButton.disabled = !enabled;
}

function shuffle(points) {
  const result = [...points];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

function finishRound() {
  state.currentQuestion = null;
  state.answered = true;
  promptEl.textContent = "Ronde klaar";
  setFeedback(`Je had ${state.correct} juist en ${state.wrong} fout.`, "good");
  clearMarks();
  nextButton.disabled = true;
  revealButton.disabled = true;
  retryButton.style.display = state.wrongPoints.length > 0 ? "" : "none";
}

function pickQuestion() {
  if (state.points.length === 0) return;
  if (state.remainingPoints.length === 0) {
    finishRound();
    return;
  }
  state.currentQuestion = state.remainingPoints.shift();
  state.answered = false;
  promptEl.textContent = state.currentQuestion.label;
  setFeedback("");
  clearMarks();
}

function goToNextQuestion() {
  if (!state.currentQuestion) return;
  if (!state.answered) {
    window.alert("Duid eerst een punt aan");
    return;
  }
  pickQuestion();
}

function checkAnswer(point) {
  if (state.answered || !state.currentQuestion) return;
  state.answered = true;
  if (point === state.currentQuestion) {
    point.status = "correct";
    state.correct += 1;
    state.streak += 1;
    setFeedback("Juist.", "good");
  } else {
    point.status = "incorrect";
    state.currentQuestion.status = "reveal";
    state.wrong += 1;
    state.streak = 0;
    if (!state.wrongPoints.includes(state.currentQuestion)) {
      state.wrongPoints.push(state.currentQuestion);
    }
    setFeedback("Fout.", "bad");
  }
  updatePointSource();
  updateStats();
}

function revealAnswer() {
  if (!state.currentQuestion || state.answered) return;
  clearMarks();
  state.currentQuestion.status = "reveal";
  state.answered = true;
  state.wrong += 1;
  state.streak = 0;
  if (!state.wrongPoints.includes(state.currentQuestion)) {
    state.wrongPoints.push(state.currentQuestion);
  }
  updatePointSource();
  updateStats();
  setFeedback(`Dit is ${state.currentQuestion.label}.`, "bad");
}

function resetQuiz() {
  state.correct = 0;
  state.wrong = 0;
  state.streak = 0;
  state.wrongPoints = [];
  state.remainingPoints = shuffle(state.points);
  nextButton.disabled = false;
  revealButton.disabled = false;
  retryButton.style.display = "none";
  updateStats();
  pickQuestion();
}

function loadSvgText(svgText, fileName) {
  const svg = new DOMParser().parseFromString(svgText, "image/svg+xml");
  if (svg.querySelector("parsererror")) {
    throw new Error("Deze SVG kon niet gelezen worden.");
  }

  const points = readPoints(svg).filter((point) =>
    state.allowedPointIds.has(normalizePointId(point.label))
  );
  state.svgText = svgText;
  state.fileName = fileName;
  state.points = points;
  state.remainingPoints = shuffle(points);
  state.wrongPoints = [];
  state.currentQuestion = null;
  state.correct = 0;
  state.wrong = 0;
  state.streak = 0;
  state.imageCoordinates = imageCoordinatesFromReferences(svg, points);
  state.imageUrl = URL.createObjectURL(
    new Blob([makeBackgroundSvg(svgText)], { type: "image/svg+xml" })
  );

  updateStats();
  retryButton.style.display = "none";
  if (points.length === 0) {
    promptEl.textContent = "Geen punten gevonden";
    setFeedback(
      `Voor ${activeRole.label} zijn geen punten uit de categorie ${moduleConfig.id} gevonden.`,
      "bad"
    );
    setControlsEnabled(false);
    return;
  }

  setControlsEnabled(true);
  initializeMap();
  pickQuestion();
}

function retryWrongPoints() {
  if (state.wrongPoints.length === 0) return;
  state.correct = 0;
  state.wrong = 0;
  state.streak = 0;
  state.remainingPoints = shuffle(state.wrongPoints);
  state.wrongPoints = [];
  nextButton.disabled = false;
  revealButton.disabled = false;
  retryButton.style.display = "none";
  updateStats();
  pickQuestion();
}

nextButton.addEventListener("click", goToNextQuestion);
revealButton.addEventListener("click", revealAnswer);
resetButton.addEventListener("click", resetQuiz);
retryButton.addEventListener("click", retryWrongPoints);
hideObjectsEl.addEventListener("change", () => {
  if (state.map?.getLayer("training-points")) {
    state.map.setLayoutProperty(
      "training-points",
      "visibility",
      hideObjectsEl.checked ? "none" : "visible"
    );
  }
});
backgroundModeEl.addEventListener("change", () => {
  applyBackground(backgroundModeEl.value);
});

initMap();
