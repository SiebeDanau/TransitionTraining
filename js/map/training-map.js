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
  constructor({ container, noteElement, backgroundMode = "osm", showPointInfo = false }) {
    super();
    this.container = container;
    this.noteElement = noteElement;
    this.backgroundMode = backgroundMode;
    this.points = [];
    this.statuses = new Map();
    this.hoveredFeatureKey = null;
    this.map = null;
    this.answerPopup = null;
    this.showPointInfo = showPointInfo;
    this.hoverPopup = null;
    this.routeKeys = [];
    this.routeLabels = [];
  }

  initialize(points) {
    this.#updateBackgroundNote();
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
      dragRotate: false,
      touchPitch: false,
      attributionControl: false,
    });
    this.map.touchZoomRotate.disableRotation();
    this.map.keyboard.disableRotation();
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    this.map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    this.map.on("style.load", () => this.#restoreLayers());
    this.map.once("load", () => this.#fitToData());
    this.map.on("click", "training-hit-area", (event) => {
      const featureKey = event.features?.[0]?.properties?.id;
      if (featureKey) this.dispatchEvent(new CustomEvent("select", { detail: { featureKey } }));
    });
    this.map.on("mousemove", "training-hit-area", (event) => {
      const featureKey = event.features?.[0]?.properties?.id || null;
      this.map.getCanvas().style.cursor = "pointer";
      this.#setHoveredFeature(featureKey);
    });
    this.map.on("mouseleave", "training-hit-area", () => {
      this.map.getCanvas().style.cursor = "";
      this.#setHoveredFeature(null);
    });
  }

  setBackground(mode) {
    if (!this.map) return;
    this.#setHoveredFeature(null);
    this.backgroundMode = mode;
    this.#updateBackgroundNote();
    this.map.setStyle(mode === "local" ? BLANK_STYLE : OSM_STYLE_URL);
  }

  #updateBackgroundNote() {
    this.noteElement.textContent = this.backgroundMode === "local"
      ? "De bestaande rustige trainingskaart blijft behouden."
      : this.backgroundMode === "cities"
        ? "Plaatsnamen, wegen en bebouwing helpen je steden te situeren."
        : "Alleen land, water, grote rivieren en landsgrenzen blijven zichtbaar.";
  }

  clearFeedback() {
    this.routeLabels.forEach(label => label.remove());
    this.routeLabels = [];
    this.routeKeys = [];
    this.#updateRouteLine();
    this.answerPopup?.remove();
    this.answerPopup = null;
    this.statuses.clear();
    this.#updatePointSource();
  }

  showAnswer({ selectedFeatureKey, correctFeatureKey, correct, revealed }) {
    this.clearFeedback();
    if (revealed) {
      this.statuses.set(correctFeatureKey, "reveal");
    } else if (correct) {
      this.statuses.set(correctFeatureKey, "correct");
    } else {
      this.statuses.set(selectedFeatureKey, "incorrect");
      this.statuses.set(correctFeatureKey, "reveal");
    }
    this.#updatePointSource();
    const point = this.points.find((item) => item.featureKey === correctFeatureKey);
    if (this.map && point?.answerName) {
      const content = document.createElement("div");
      content.setAttribute("role", "status");
      const code = document.createElement("div");
      code.className = "answer-airport-code";
      code.textContent = point.label;
      const name = document.createElement("div");
      name.className = "answer-airport-name";
      name.textContent = point.answerName;
      content.append(code, name);
      this.answerPopup = new maplibregl.Popup({
        className: "answer-airport-popup",
        closeButton: false,
        closeOnClick: false,
        offset: 18,
        maxWidth: "280px",
      }).setLngLat([point.lon, point.lat]).setDOMContent(content).addTo(this.map);
    }
  }

  setRouteProgress(completed, incorrect = null) {
    this.routeKeys = [...completed];
    this.statuses.clear();
    completed.forEach((key) => this.statuses.set(key, "correct"));
    if (incorrect) this.statuses.set(incorrect, "incorrect");
    this.#updatePointSource();
    this.#setHoveredFeature(null);
    this.#updateRouteLine();
  }

  #pointContent(point, prefix = "") {
    const content = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = prefix + point.label;
    const type = document.createElement("div");
    type.textContent = point.typeLabel || "Routepunt";
    content.append(name, type);
    return content;
  }

  revealRoute(keys) {
    this.setRouteProgress(keys);
    this.routeLabels.forEach(label => label.remove());
    const groups = new Map();
    keys.forEach((key, index) => {
      const point = this.points.find(point => point.featureKey === key);
      if (!point) return;
      const coordinate = `${point.lon},${point.lat}`;
      if (!groups.has(coordinate)) groups.set(coordinate, { point, content: document.createElement("div") });
      groups.get(coordinate).content.append(this.#pointContent(point, `${index + 1}. `));
    });
    this.routeLabels = [...groups.values()].map(({ point, content }) =>
      new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 15, maxWidth: "230px", className: "point-info-popup route-answer-label" })
        .setLngLat([point.lon, point.lat]).setDOMContent(content).addTo(this.map));
    const bounds = new maplibregl.LngLatBounds();
    groups.forEach(({ point }) => bounds.extend([point.lon, point.lat]));
    if (groups.size) this.map.fitBounds(bounds, { padding: 100, maxZoom: 9, duration: 400 });
  }

  #updateRouteLine() {
    if (!this.showPointInfo || !this.map?.getSource("training-route")) return;
    const coordinates = this.routeKeys.map(key => this.points.find(point => point.featureKey === key))
      .filter(Boolean).map(point => [point.lon, point.lat]);
    this.map.getSource("training-route").setData({ type: "FeatureCollection", features: coordinates.length < 2 ? [] : [
      { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } },
    ] });
  }

  #pointGeoJson() {
    return {
      type: "FeatureCollection",
      features: this.points.map((point) => ({
        type: "Feature",
        id: point.featureKey,
        properties: { id: point.featureKey, label: point.label, color: point.color || "#d62728", status: this.statuses.get(point.featureKey) || "idle" },
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
    if (this.showPointInfo) {
      this.#addReferenceLayer("training-route", "training-route-line", { type: "FeatureCollection", features: [] }, "#167847", 4);
      this.#updateRouteLine();
    }
    this.#addPointLayers();
  }

  #addPointLayers() {
    if (!this.map.getLayer("training-points")) this.map.addLayer({
      id: "training-points", type: "circle", source: "training-points",
      paint: {
        "circle-radius": this.showPointInfo ? 4.5 : ["case", ["==", ["get", "status"], "idle"], 4.5, 10],
        "circle-color": this.showPointInfo ? ["get", "color"] : ["match", ["get", "status"], "correct", "rgba(0, 0, 0, 0)", "incorrect", "#b3261e", "reveal", "rgba(0, 0, 0, 0)", "#d62728"],
        "circle-stroke-color": ["match", ["get", "status"], "correct", "#0b5d36", "incorrect", "#7d1712", "reveal", "#167847", "#ffffff"],
        "circle-stroke-width": this.showPointInfo ? 1.5 : ["case", ["==", ["get", "status"], "idle"], 1.5, 4],
      },
    });
    if (!this.map.getLayer("training-revealed-point")) this.map.addLayer({
      id: "training-revealed-point", type: "circle", source: "training-points",
      filter: ["in", ["get", "status"], ["literal", ["correct", "reveal"]]],
      paint: { "circle-radius": 4.5, "circle-color": ["get", "color"], "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5 },
    });
    if (!this.map.getLayer("training-feedback")) this.map.addLayer({
      id: "training-feedback", type: "circle", source: "training-points",
      filter: ["!=", ["get", "status"], "idle"],
      paint: {
        "circle-radius": 10,
        "circle-color": this.showPointInfo ? "rgba(0, 0, 0, 0)" : ["match", ["get", "status"], "correct", "rgba(0, 0, 0, 0)", "incorrect", "#b3261e", "reveal", "rgba(0, 0, 0, 0)", "#d62728"],
        "circle-stroke-color": ["match", ["get", "status"], "correct", "#0b5d36", "incorrect", "#7d1712", "reveal", "#167847", "#ffffff"],
        "circle-stroke-width": 4,
      },
    });
    if (!this.map.getLayer("training-hover-preview")) this.map.addLayer({
      id: "training-hover-preview", type: "circle", source: "training-points",
      filter: ["==", ["get", "id"], this.hoveredFeatureKey || ""],
      paint: {
        "circle-radius": 12,
        "circle-color": "rgba(17, 107, 120, 0.12)",
        "circle-stroke-color": this.showPointInfo ? ["case", ["==", ["get", "status"], "correct"], "#0b5d36", "#116b78"] : "#116b78",
        "circle-stroke-width": 3,
      },
    });
    if (!this.map.getLayer("training-hit-area")) this.map.addLayer({
      id: "training-hit-area", type: "circle", source: "training-points",
      paint: { "circle-radius": 15, "circle-opacity": 0, "circle-stroke-opacity": 0 },
    });
  }

  #setHoveredFeature(featureKey) {
    if (this.hoveredFeatureKey === featureKey) return;
    this.hoveredFeatureKey = featureKey;
    this.hoverPopup?.remove();
    this.hoverPopup = null;
    const point = this.points.find(item => item.featureKey === featureKey);
    if (this.showPointInfo && point) {
      const content = this.#pointContent(point);
      this.hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 18, maxWidth: "260px", className: "point-info-popup" })
        .setLngLat([point.lon, point.lat]).setDOMContent(content).addTo(this.map);
    }
    if (this.map?.getLayer("training-hover-preview")) {
      this.map.setFilter(
        "training-hover-preview",
        ["==", ["get", "id"], featureKey || ""],
      );
    }
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
