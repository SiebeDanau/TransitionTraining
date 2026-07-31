const BLANK_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#f7f6f1" } }],
};

const OSM_STYLE_URL = "https://tiles.openfreemap.org/styles/bright";
const AIRSPACE_DATA_VERSION = "20260731-1";
const TMA_FILE_GROUPS = {
  "brussels-tma": ["brussels-tma-1", "brussels-tma-2", "brussels-tma-3a", "brussels-tma-3b", "brussels-tma-4", "brussels-tma-5", "brussels-tma-7", "brussels-tma-8", "brussels-tma-9a", "brussels-tma-9b"],
  "charleroi-tma": ["charleroi-tma-1", "charleroi-tma-2a", "charleroi-tma-2b", "charleroi-tma-3a", "charleroi-tma-3b"],
  "liege-tma": ["liege-tma-1", "liege-tma-2", "liege-tma-3", "liege-tma-4", "liege-tma-5"],
  "luxembourg-tma": ["luxembourg-tma-1a", "luxembourg-tma-1b", "luxembourg-tma-2a", "luxembourg-tma-2b", "luxembourg-tma-2c", "luxembourg-tma-2d", "luxembourg-tma-2e", "luxembourg-tma-2f", "luxembourg-tma-3", "luxembourg-tma-4", "luxembourg-tma-5"],
  "lille-tma": ["lille-tma-2", "lille-tma-9"],
  "maastricht-tma": ["maastricht-tma-1", "maastricht-tma-2"],
  "oostende-tma": ["oostende-tma-1", "oostende-tma-2"],
};

export class TrainingMap extends EventTarget {
  constructor({ container, noteElement, backgroundMode = "local" }) {
    super();
    this.container = container;
    this.noteElement = noteElement;
    this.backgroundMode = backgroundMode;
    this.points = [];
    this.statuses = new Map();
    this.map = null;
  }

  initialize(points) {
    if (!window.maplibregl) {
      this.container.className = "map-error";
      this.container.textContent = "De interactieve kaart kon niet geladen worden. Controleer de internetverbinding.";
      throw new Error("MapLibre kon niet geladen worden.");
    }
    this.points = [...points];
    this.map = new maplibregl.Map({
      container: this.container,
      style: this.backgroundMode === "local" ? BLANK_STYLE : OSM_STYLE_URL,
      center: [4.55, 50.65],
      zoom: 6.2,
      attributionControl: false,
    });
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    this.map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    this.map.on("style.load", () => this.#restoreLayers());
    this.map.once("load", () => this.#fitToData());
    this.map.on("click", "training-hit-area", (event) => {
      const featureKey = event.features?.[0]?.properties?.id;
      if (featureKey) this.dispatchEvent(new CustomEvent("select", { detail: { featureKey } }));
    });
    this.map.on("mouseenter", "training-hit-area", () => { this.map.getCanvas().style.cursor = "pointer"; });
    this.map.on("mouseleave", "training-hit-area", () => { this.map.getCanvas().style.cursor = ""; });
  }

  setBackground(mode) {
    if (!this.map) return;
    this.backgroundMode = mode;
    this.noteElement.textContent = mode === "local"
      ? "De bestaande rustige trainingskaart blijft behouden."
      : "Alleen land, water, grote rivieren en landsgrenzen blijven zichtbaar.";
    this.map.setStyle(mode === "local" ? BLANK_STYLE : OSM_STYLE_URL);
  }

  clearFeedback() {
    this.statuses.clear();
    this.#updatePointSource();
  }

  showAnswer({ selectedFeatureKey, correctFeatureKey, correct, revealed }) {
    this.statuses.clear();
    if (revealed) {
      this.statuses.set(correctFeatureKey, "reveal");
    } else if (correct) {
      this.statuses.set(correctFeatureKey, "correct");
    } else {
      this.statuses.set(selectedFeatureKey, "incorrect");
      this.statuses.set(correctFeatureKey, "reveal");
    }
    this.#updatePointSource();
  }

  #pointGeoJson() {
    return {
      type: "FeatureCollection",
      features: this.points.map((point) => ({
        type: "Feature",
        id: point.featureKey,
        properties: { id: point.featureKey, label: point.label, status: this.statuses.get(point.featureKey) || "idle" },
        geometry: { type: "Point", coordinates: [point.lon, point.lat] },
      })),
    };
  }

  #updatePointSource() {
    this.map?.getSource("training-points")?.setData(this.#pointGeoJson());
  }

  #addReferenceLayer(sourceId, layerId, data, color, width) {
    if (!this.map.getSource(sourceId)) this.map.addSource(sourceId, { type: "geojson", data });
    if (!this.map.getLayer(layerId)) this.map.addLayer({
      id: layerId,
      type: "line",
      source: sourceId,
      layout: { visibility: "visible", "line-cap": "round", "line-join": "round" },
      paint: { "line-color": color, "line-width": width, "line-opacity": 1 },
    });
  }

  #addLayers() {
    this.#addReferenceLayer("brussels-uir", "brussels-uir-outline", `data/airspaces/brussels-uir.geojson?v=${AIRSPACE_DATA_VERSION}`, "#000000", ["interpolate", ["linear"], ["zoom"], 5, 3, 9, 5]);
    this.#addReferenceLayer("amsterdam-fir", "amsterdam-fir-outline", `data/airspaces/amsterdam-fir.geojson?v=${AIRSPACE_DATA_VERSION}`, "#000000", ["interpolate", ["linear"], ["zoom"], 5, 3, 9, 5]);
    Object.entries(TMA_FILE_GROUPS).forEach(([folder, files]) => files.forEach((sourceId) => {
      const width = sourceId === "maastricht-tma-1"
        ? ["interpolate", ["linear"], ["zoom"], 5, 4, 9, 6]
        : ["interpolate", ["linear"], ["zoom"], 5, 2, 9, 4];
      this.#addReferenceLayer(sourceId, `tma-${sourceId}-outline`, `data/airspaces/${encodeURIComponent(folder)}/${sourceId}.geojson?v=${AIRSPACE_DATA_VERSION}`, "#2563eb", width);
    }));
    if (!this.map.getSource("training-points")) this.map.addSource("training-points", { type: "geojson", data: this.#pointGeoJson() });
    this.#addPointLayers();
  }

  #addPointLayers() {
    if (!this.map.getLayer("training-points")) this.map.addLayer({
      id: "training-points", type: "circle", source: "training-points",
      paint: {
        "circle-radius": ["case", ["==", ["get", "status"], "idle"], 4.5, 10],
        "circle-color": ["match", ["get", "status"], "correct", "rgba(0, 0, 0, 0)", "incorrect", "#b3261e", "reveal", "rgba(0, 0, 0, 0)", "#d62728"],
        "circle-stroke-color": ["match", ["get", "status"], "correct", "#0b5d36", "incorrect", "#7d1712", "reveal", "#167847", "#ffffff"],
        "circle-stroke-width": ["case", ["==", ["get", "status"], "idle"], 1.5, 4],
      },
    });
    if (!this.map.getLayer("training-revealed-point")) this.map.addLayer({
      id: "training-revealed-point", type: "circle", source: "training-points",
      filter: ["in", ["get", "status"], ["literal", ["correct", "reveal"]]],
      paint: { "circle-radius": 4.5, "circle-color": "#d62728", "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5 },
    });
    if (!this.map.getLayer("training-feedback")) this.map.addLayer({
      id: "training-feedback", type: "circle", source: "training-points",
      filter: ["!=", ["get", "status"], "idle"],
      paint: {
        "circle-radius": 10,
        "circle-color": ["match", ["get", "status"], "correct", "rgba(0, 0, 0, 0)", "incorrect", "#b3261e", "reveal", "rgba(0, 0, 0, 0)", "#d62728"],
        "circle-stroke-color": ["match", ["get", "status"], "correct", "#0b5d36", "incorrect", "#7d1712", "reveal", "#167847", "#ffffff"],
        "circle-stroke-width": 4,
      },
    });
    if (!this.map.getLayer("training-hit-area")) this.map.addLayer({
      id: "training-hit-area", type: "circle", source: "training-points",
      paint: { "circle-radius": 15, "circle-opacity": 0, "circle-stroke-opacity": 0 },
    });
  }

  #simplifyOsmStyle() {
    (this.map.getStyle()?.layers || []).forEach((layer) => {
      if (/^(brussels-uir|amsterdam-fir|tma-|training-)/.test(layer.id)) return;
      if (layer.type === "background") {
        this.map.setPaintProperty(layer.id, "background-color", "#f7f6f1");
        return;
      }
      const identity = `${layer.id} ${layer["source-layer"] || ""}`.toLowerCase();
      const keepWater = /(water|ocean|sea|river)/.test(identity) && !/(label|name|canal|ditch|drain|stream)/.test(identity);
      const keepRiver = /river/.test(identity) && !/(label|name|small|minor)/.test(identity);
      const keepBoundary = /(boundary|admin)/.test(identity) && /(country|national|admin-0|admin_0|admin0)/.test(identity);
      try { this.map.setLayoutProperty(layer.id, "visibility", keepWater || keepRiver || keepBoundary ? "visible" : "none"); }
      catch (error) { console.warn(`Kaartlaag ${layer.id} kon niet worden gefilterd.`, error); }
    });
  }

  #restoreLayers() {
    if (this.backgroundMode === "osm") this.#simplifyOsmStyle();
    this.#addLayers();
    this.#updatePointSource();
  }

  #fitToData() {
    if (!this.points.length) return;
    const bounds = new maplibregl.LngLatBounds();
    this.points.forEach((point) => bounds.extend([point.lon, point.lat]));
    this.map.fitBounds(bounds, { padding: 54, duration: 0, maxZoom: 7.4 });
  }
}
