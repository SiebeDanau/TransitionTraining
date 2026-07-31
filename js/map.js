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
const TMA_FILE_GROUPS = {
  "brussels-tma": [
    "brussels-tma-1",
    "brussels-tma-2",
    "brussels-tma-3a",
    "brussels-tma-3b",
    "brussels-tma-4",
    "brussels-tma-5",
    "brussels-tma-7",
    "brussels-tma-8",
    "brussels-tma-9a",
    "brussels-tma-9b",
  ],
  "charleroi-tma": [
    "charleroi-tma-1",
    "charleroi-tma-2a",
    "charleroi-tma-2b",
    "charleroi-tma-3a",
    "charleroi-tma-3b",
  ],
  "liege-tma": [
    "liege-tma-1",
    "liege-tma-2",
    "liege-tma-3",
    "liege-tma-4",
    "liege-tma-5",
  ],
  "luxembourg-tma": [
    "luxembourg-tma-1a",
    "luxembourg-tma-1b",
    "luxembourg-tma-2a",
    "luxembourg-tma-2b",
    "luxembourg-tma-2c",
    "luxembourg-tma-2d",
    "luxembourg-tma-2e",
    "luxembourg-tma-2f",
    "luxembourg-tma-3",
    "luxembourg-tma-4",
    "luxembourg-tma-5",
  ],
  "lille-tma": ["lille-tma-2", "lille-tma-9"],
  "maastricht-tma": ["maastricht-tma-1", "maastricht-tma-2"],
  "oostende-tma": ["oostende-tma-1", "oostende-tma-2"],
};

const state = {
  points: [],
  remainingPoints: [],
  wrongPoints: [],
  currentQuestion: null,
  correct: 0,
  wrong: 0,
  streak: 0,
  answered: false,
  allowedPointIds: new Set(),
  map: null,
  backgroundMode: localStorage.getItem("mapBackgroundMode") || "local",
};

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
let moduleConfig = JSON.parse(localStorage.getItem("activeModule"));
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

function normalizePointId(value) {
  return String(value || "").trim().toUpperCase();
}

function parseCoordinate(value) {
  if (typeof value === "number") return value;
  const normalized = String(value || "").trim().toUpperCase();
  const match = normalized.match(/^(\d{2,3})(\d{2})(\d{2}(?:\.\d+)?)([NSEW])$/);
  if (!match) return Number.NaN;
  const degrees = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const sign = match[4] === "S" || match[4] === "W" ? -1 : 1;
  return sign * (degrees + minutes / 60 + seconds / 3600);
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
  if (!map) return;

  if (!map.getSource("brussels-uir")) {
    map.addSource("brussels-uir", {
      type: "geojson",
      data: "data/airspaces/brussels-uir.geojson?v=20260726-3",
    });
  }
  if (!map.getLayer("brussels-uir-outline")) {
    map.addLayer({
      id: "brussels-uir-outline",
      type: "line",
      source: "brussels-uir",
      layout: {
        visibility: "visible",
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#000000",
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 3, 9, 5],
        "line-opacity": 1,
      },
    });
  }

  if (!map.getSource("amsterdam-fir")) {
    map.addSource("amsterdam-fir", {
      type: "geojson",
      data: "data/airspaces/amsterdam-fir.geojson",
    });
  }
  if (!map.getLayer("amsterdam-fir-outline")) {
    map.addLayer({
      id: "amsterdam-fir-outline",
      type: "line",
      source: "amsterdam-fir",
      layout: {
        visibility: "visible",
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#000000",
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 3, 9, 5],
        "line-opacity": 1,
      },
    });
  }

  Object.entries(TMA_FILE_GROUPS).forEach(([folder, files]) => {
    files.forEach((sourceId) => {
      const layerId = `tma-${sourceId}-outline`;
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: "geojson",
          data: `data/airspaces/${encodeURIComponent(folder)}/${sourceId}.geojson`,
        });
      }
      if (!map.getLayer(layerId)) {
        map.addLayer({
          id: layerId,
          type: "line",
          source: sourceId,
          layout: {
            visibility: "visible",
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": "#2563eb",
            "line-width":
              sourceId === "maastricht-tma-1"
                ? ["interpolate", ["linear"], ["zoom"], 5, 4, 9, 6]
                : ["interpolate", ["linear"], ["zoom"], 5, 2, 9, 4],
            "line-opacity": 1,
          },
        });
      }
    });
  });

  if (!map.getSource("training-points")) {
    map.addSource("training-points", {
      type: "geojson",
      data: pointGeoJson(),
    });
  }
  if (!map.getLayer("training-points")) map.addLayer({
    id: "training-points",
    type: "circle",
    source: "training-points",
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
        "rgba(0, 0, 0, 0)",
        "incorrect",
        "#b3261e",
        "reveal",
        "rgba(0, 0, 0, 0)",
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

  if (!map.getLayer("training-revealed-point")) map.addLayer({
    id: "training-revealed-point",
    type: "circle",
    source: "training-points",
    filter: [
      "in",
      ["get", "status"],
      ["literal", ["correct", "reveal"]],
    ],
    paint: {
      "circle-radius": 4.5,
      "circle-color": "#d62728",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
    },
  });

  if (!map.getLayer("training-feedback")) map.addLayer({
    id: "training-feedback",
    type: "circle",
    source: "training-points",
    filter: ["!=", ["get", "status"], "idle"],
    paint: {
      "circle-radius": 10,
      "circle-color": [
        "match",
        ["get", "status"],
        "correct",
        "rgba(0, 0, 0, 0)",
        "incorrect",
        "#b3261e",
        "reveal",
        "rgba(0, 0, 0, 0)",
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
      "circle-stroke-width": 4,
    },
  });

  if (!map.getLayer("training-hit-area")) map.addLayer({
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
    if (
      layer.id.startsWith("brussels-uir") ||
      layer.id.startsWith("tma-") ||
      layer.id.startsWith("training-")
    ) {
      return;
    }
    if (layer.type === "background") {
      try {
        map.setPaintProperty(layer.id, "background-color", "#f7f6f1");
      } catch (error) {
        console.warn(`Achtergrondlaag ${layer.id} kon niet worden aangepast.`, error);
      }
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
    try {
      map.setLayoutProperty(
        layer.id,
        "visibility",
        keepWater || keepRiver || keepBoundary ? "visible" : "none"
      );
    } catch (error) {
      console.warn(`Kaartlaag ${layer.id} kon niet worden gefilterd.`, error);
    }
  });
}

function restoreMapLayers() {
  if (state.backgroundMode === "osm") simplifyOsmStyle();
  addTrainingLayers();
  updatePointSource();
}

function fitMapToData() {
  if (!state.map || state.points.length === 0) return;
  const bounds = new maplibregl.LngLatBounds();
  state.points.forEach((point) => bounds.extend([point.lon, point.lat]));
  state.map.fitBounds(bounds, { padding: 54, duration: 0, maxZoom: 7.4 });
}

function applyBackground(mode) {
  if (!state.map) return;
  state.backgroundMode = mode;
  localStorage.setItem("mapBackgroundMode", mode);
  mapNoteEl.textContent =
    mode === "local"
      ? "De bestaande rustige trainingskaart blijft behouden."
      : "Alleen land, water, grote rivieren en landsgrenzen blijven zichtbaar.";

  state.map.setStyle(mode === "local" ? BLANK_STYLE : OSM_STYLE_URL);
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

  state.map.on("style.load", () => {
    restoreMapLayers();
  });
  state.map.once("load", () => {
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
    const [configResponse, roleResponse] = await Promise.all([
      fetch("data/config.json", { cache: "no-store" }),
      fetch("data/roles.json", { cache: "no-store" }),
    ]);
    if (!configResponse.ok || !roleResponse.ok) {
      throw new Error("Moduleconfiguratie of rollenbestand kon niet geladen worden.");
    }

    const [config, roleConfig] = await Promise.all([
      configResponse.json(),
      roleResponse.json(),
    ]);
    const latestModuleConfig = config.modules?.find(
      (item) => item.id === moduleConfig.id
    );
    if (!latestModuleConfig) {
      throw new Error(`Module "${moduleConfig.id}" bestaat niet meer.`);
    }
    moduleConfig = latestModuleConfig;
    localStorage.setItem("activeModule", JSON.stringify(moduleConfig));
    setTitle();

    const dataFiles = Array.isArray(moduleConfig.data) ? moduleConfig.data : [];
    const dataResponses = await Promise.all([
      ...dataFiles.map((file) => fetch(`data/${file}`, { cache: "no-store" })),
    ]);
    if (dataResponses.some((response) => !response.ok)) {
      throw new Error("Een puntenbestand kon niet geladen worden.");
    }

    const pointCollections = await Promise.all([
      ...dataResponses.map((response) => response.json()),
    ]);
    const role = roleConfig.roles?.find((item) => item.id === activeRole.id);
    const category = role?.categories?.[moduleConfig.id];
    state.allowedPointIds = new Set(
      (category?.pointIds || []).map(normalizePointId)
    );
    loadPoints(pointCollections.flatMap((collection) => collection.points || []));
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
  const answered = state.correct + state.wrong;
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
  promptEl.textContent = state.currentQuestion.questionLabel;
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
    setFeedback(`Fout. Je duidde ${point.questionLabel} aan.`, "bad");
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

function loadPoints(records) {
  const uniquePoints = new Map();
  records.forEach((record) => {
    const id = normalizePointId(record.id || record.name || record.title);
    const lat = parseCoordinate(record.lat);
    const lon = parseCoordinate(record.lon);
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const label = record.name || id;
    const questionLabel = label;
    uniquePoints.set(id, {
      id,
      label,
      questionLabel,
      lat,
      lon,
      status: "idle",
    });
  });

  const missingPointIds = Array.from(state.allowedPointIds).filter(
    (id) => !uniquePoints.has(id)
  );
  if (missingPointIds.length > 0) {
    console.warn(
      `[${moduleConfig.id}] ${missingPointIds.length} punten voor rol ` +
        `"${activeRole.label}" zijn niet gevonden in de geconfigureerde databronnen:`,
      missingPointIds,
      moduleConfig.data || []
    );
  }

  const points = Array.from(uniquePoints.values())
    .filter(
      (point) =>
        state.allowedPointIds.size === 0 ||
        state.allowedPointIds.has(normalizePointId(point.id))
    )
    .sort((a, b) => a.label.localeCompare(b.label));

  state.points = points;
  state.remainingPoints = shuffle(points);
  state.wrongPoints = [];
  state.currentQuestion = null;
  state.correct = 0;
  state.wrong = 0;
  state.streak = 0;

  updateStats();
  retryButton.style.display = "none";
  initializeMap();
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
backgroundModeEl.addEventListener("change", () => {
  applyBackground(backgroundModeEl.value);
});

initMap();
