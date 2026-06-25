const SVG_NS = "http://www.w3.org/2000/svg";
const TOOL_GROUP_ID = "geo-svg-tool-objects";
const REFERENCE_GROUP_ID = "geo-svg-tool-references";
const TOOL_ATTR = "data-geo-svg-tool";

const state = {
  svgDocument: null,
  svgText: "",
  fileName: "",
  viewBox: [0, 0, 100, 100],
  references: [],
  objects: [],
  selectedReferenceId: "",
  selectedObjectId: "",
  nextReferenceNumber: 1,
  zoom: 1,
};

const svgFileEl = document.querySelector("#svgFile");
const downloadButton = document.querySelector("#downloadButton");
const fileStatus = document.querySelector("#fileStatus");
const mapStatus = document.querySelector("#mapStatus");
const mapWrap = document.querySelector("#mapWrap");
const mapImage = document.querySelector("#mapImage");
const overlay = document.querySelector("#overlay");
const zoomOutButton = document.querySelector("#zoomOutButton");
const zoomInButton = document.querySelector("#zoomInButton");
const zoomResetButton = document.querySelector("#zoomResetButton");
const zoomLabel = document.querySelector("#zoomLabel");
const referenceSelect = document.querySelector("#referenceSelect");
const referenceLat = document.querySelector("#referenceLat");
const referenceLon = document.querySelector("#referenceLon");
const referenceX = document.querySelector("#referenceX");
const referenceY = document.querySelector("#referenceY");
const saveReferenceButton = document.querySelector("#saveReferenceButton");
const newReferenceButton = document.querySelector("#newReferenceButton");
const deleteReferenceButton = document.querySelector("#deleteReferenceButton");
const referenceList = document.querySelector("#referenceList");
const objectTitle = document.querySelector("#objectTitle");
const objectLat = document.querySelector("#objectLat");
const objectLon = document.querySelector("#objectLon");
const saveObjectButton = document.querySelector("#saveObjectButton");
const newObjectButton = document.querySelector("#newObjectButton");
const deleteObjectButton = document.querySelector("#deleteObjectButton");
const objectStatus = document.querySelector("#objectStatus");
const objectList = document.querySelector("#objectList");

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function number(value) {
  return Number.parseFloat(String(value || "").trim().replace(",", "."));
}

function coordinateNumber(value, axis) {
  const text = String(value || "").trim().toUpperCase().replace(",", ".");
  if (!text) return NaN;

  if (/^[+-]?\d+(\.\d+)?$/.test(text)) {
    return Number.parseFloat(text);
  }

  const match = /^(\d+)([NSEW])$/.exec(text);
  if (!match) return NaN;

  const digits = match[1];
  const direction = match[2];
  const isLatitude = direction === "N" || direction === "S";
  const isLongitude = direction === "E" || direction === "W";
  if ((axis === "lat" && !isLatitude) || (axis === "lon" && !isLongitude)) {
    return NaN;
  }
  if (digits.length < 5 || digits.length > 7) return NaN;

  const degreeLength = isLatitude ? 2 : digits.length - 4;
  if (degreeLength < 1 || degreeLength > 3) return NaN;

  const degrees = Number.parseInt(digits.slice(0, degreeLength), 10);
  const minutes = Number.parseInt(digits.slice(degreeLength, degreeLength + 2), 10);
  const seconds = Number.parseFloat(digits.slice(degreeLength + 2));
  if (
    !Number.isFinite(degrees) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    minutes >= 60 ||
    seconds >= 60
  ) {
    return NaN;
  }

  const decimal = degrees + minutes / 60 + seconds / 3600;
  const signed = direction === "S" || direction === "W" ? -decimal : decimal;
  const limit = isLatitude ? 90 : 180;
  return Math.abs(signed) <= limit ? signed : NaN;
}

function coordinatePairFromFields(latValue, lonValue) {
  const latText = String(latValue || "").trim();
  const lonText = String(lonValue || "").trim();

  if (!lonText) {
    const pairMatch = /^(\d+\s*[NS])[\s,/;]+(\d+\s*[EW])$/i.exec(latText);
    if (pairMatch) {
      return {
        lat: coordinateNumber(pairMatch[1].replace(/\s+/g, ""), "lat"),
        lon: coordinateNumber(pairMatch[2].replace(/\s+/g, ""), "lon"),
      };
    }
  }

  return {
    lat: coordinateNumber(latText.replace(/\s+/g, ""), "lat"),
    lon: coordinateNumber(lonText.replace(/\s+/g, ""), "lon"),
  };
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "";
  return Number.parseFloat(value.toFixed(6)).toString();
}

function setStatus(element, text, type = "") {
  element.textContent = text;
  element.className = type ? `status ${type}` : "status";
}

function readViewBox(svgDocument) {
  const root = svgDocument.documentElement;
  const viewBox = root.getAttribute("viewBox");
  if (viewBox) {
    const values = viewBox.split(/[,\s]+/).filter(Boolean).map(number);
    if (values.length === 4 && values.every(Number.isFinite)) return values;
  }

  const width = number(root.getAttribute("width")) || 100;
  const height = number(root.getAttribute("height")) || 100;
  return [0, 0, width, height];
}

function serializeSvg() {
  if (!state.svgDocument) return "";
  syncReferencesIntoSvg();
  syncObjectsIntoSvg();
  return new XMLSerializer().serializeToString(state.svgDocument);
}

function updateMapImage() {
  if (!state.svgDocument) return;
  const blob = new Blob([serializeSvg()], { type: "image/svg+xml" });
  mapImage.src = URL.createObjectURL(blob);
}

function setViewBox(viewBox) {
  const [minX, minY, width, height] = viewBox;
  overlay.setAttribute("viewBox", `${minX} ${minY} ${width} ${height}`);
  mapWrap.style.setProperty("--svg-ratio", `${width} / ${height}`);
  updateZoomDisplay();
}

function updateZoomDisplay() {
  mapWrap.style.width = `min(${Math.round(state.zoom * 100)}%, 9999px)`;
  mapWrap.style.minWidth = `${Math.round(720 * state.zoom)}px`;
  zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
}

function setZoom(nextZoom) {
  state.zoom = Math.min(4, Math.max(0.5, nextZoom));
  updateZoomDisplay();
}

function getPointerSvgPoint(event) {
  const rect = overlay.getBoundingClientRect();
  const [minX, minY, width, height] = state.viewBox;
  const x = minX + ((event.clientX - rect.left) / rect.width) * width;
  const y = minY + ((event.clientY - rect.top) / rect.height) * height;
  return { x, y };
}

function selectReference(id) {
  state.selectedReferenceId = id;
  const ref = state.references.find((item) => item.id === id);
  referenceSelect.value = id;
  referenceLat.value = ref ? formatNumber(ref.lat) : "";
  referenceLon.value = ref ? formatNumber(ref.lon) : "";
  referenceX.value = ref ? formatNumber(ref.x) : "";
  referenceY.value = ref ? formatNumber(ref.y) : "";
  renderReferences();
}

function selectObject(id) {
  state.selectedObjectId = id;
  const object = state.objects.find((item) => item.id === id);
  objectTitle.value = object ? object.title : "";
  objectLat.value = object ? formatNumber(object.lat) : "";
  objectLon.value = object ? formatNumber(object.lon) : "";
  deleteObjectButton.disabled = !object;
  renderObjects();
}

function newReference() {
  const ref = {
    id: uid("ref"),
    name: `Punt ${state.nextReferenceNumber}`,
    lat: NaN,
    lon: NaN,
    x: NaN,
    y: NaN,
  };
  state.nextReferenceNumber += 1;
  state.references.push(ref);
  selectReference(ref.id);
  renderAll();
}

function saveReference() {
  const ref = state.references.find(
    (item) => item.id === state.selectedReferenceId
  );
  if (!ref) return;

  const coordinates = coordinatePairFromFields(
    referenceLat.value,
    referenceLon.value
  );
  ref.lat = coordinates.lat;
  ref.lon = coordinates.lon;
  ref.x = number(referenceX.value);
  ref.y = number(referenceY.value);

  if (![ref.lat, ref.lon, ref.x, ref.y].every(Number.isFinite)) {
    setStatus(
      mapStatus,
      "Vul coordinaten in, bijvoorbeeld 502032N en 0034030E, en klik een SVG-positie.",
      "bad"
    );
    return;
  }

  referenceLat.value = formatNumber(ref.lat);
  referenceLon.value = formatNumber(ref.lon);
  setStatus(mapStatus, `${ref.name} bewaard.`, "good");
  syncReferencesIntoSvg();
  renderAll();
  updateMapImage();
  persistDraft();
}

function deleteReference() {
  const index = state.references.findIndex(
    (item) => item.id === state.selectedReferenceId
  );
  if (index === -1) return;
  state.references.splice(index, 1);
  const next = state.references[Math.max(0, index - 1)];
  selectReference(next?.id || "");
  syncReferencesIntoSvg();
  renderAll();
  updateMapImage();
  persistDraft();
}

function validReferences() {
  return state.references.filter((ref) =>
    [ref.lat, ref.lon, ref.x, ref.y].every(Number.isFinite)
  );
}

function computeTransform() {
  const refs = validReferences();
  if (refs.length < 2) return null;

  if (refs.length === 2) {
    const [a, b] = refs;
    const gx = b.lon - a.lon;
    const gy = b.lat - a.lat;
    const sx = b.x - a.x;
    const sy = b.y - a.y;
    const geoDistance = Math.hypot(gx, gy);
    if (geoDistance === 0) return null;

    const scale = Math.hypot(sx, sy) / geoDistance;
    const angle = Math.atan2(sy, sx) - Math.atan2(gy, gx);
    const cos = Math.cos(angle) * scale;
    const sin = Math.sin(angle) * scale;

    return (lat, lon) => {
      const dx = lon - a.lon;
      const dy = lat - a.lat;
      return {
        x: a.x + cos * dx - sin * dy,
        y: a.y + sin * dx + cos * dy,
      };
    };
  }

  const chosen = refs.slice(0, 3);
  const matrix = [
    [chosen[0].lon, chosen[0].lat, 1],
    [chosen[1].lon, chosen[1].lat, 1],
    [chosen[2].lon, chosen[2].lat, 1],
  ];
  const xCoefficients = solveLinear3(matrix, chosen.map((ref) => ref.x));
  const yCoefficients = solveLinear3(matrix, chosen.map((ref) => ref.y));
  if (!xCoefficients || !yCoefficients) return null;

  return (lat, lon) => ({
    x: xCoefficients[0] * lon + xCoefficients[1] * lat + xCoefficients[2],
    y: yCoefficients[0] * lon + yCoefficients[1] * lat + yCoefficients[2],
  });
}

function solveLinear3(matrix, values) {
  const m = matrix.map((row, index) => [...row, values[index]]);

  for (let pivot = 0; pivot < 3; pivot += 1) {
    let max = pivot;
    for (let row = pivot + 1; row < 3; row += 1) {
      if (Math.abs(m[row][pivot]) > Math.abs(m[max][pivot])) max = row;
    }
    if (Math.abs(m[max][pivot]) < 1e-12) return null;
    [m[pivot], m[max]] = [m[max], m[pivot]];

    const divisor = m[pivot][pivot];
    for (let col = pivot; col < 4; col += 1) m[pivot][col] /= divisor;

    for (let row = 0; row < 3; row += 1) {
      if (row === pivot) continue;
      const factor = m[row][pivot];
      for (let col = pivot; col < 4; col += 1) {
        m[row][col] -= factor * m[pivot][col];
      }
    }
  }

  return [m[0][3], m[1][3], m[2][3]];
}

function newObject() {
  state.selectedObjectId = "";
  objectTitle.value = "";
  objectLat.value = "";
  objectLon.value = "";
  deleteObjectButton.disabled = true;
  renderObjects();
}

function nextObjectTitle() {
  return `Object ${state.objects.length + 1}`;
}

function saveObject() {
  const transform = computeTransform();
  if (!transform) {
    setStatus(objectStatus, "Minstens 2 geldige referentiepunten nodig.", "bad");
    return;
  }

  const title = objectTitle.value.trim() || nextObjectTitle();
  const coordinates = coordinatePairFromFields(objectLat.value, objectLon.value);
  const lat = coordinates.lat;
  const lon = coordinates.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    setStatus(
      objectStatus,
      "Vul coordinaten in, bijvoorbeeld 502032N en 0034030E.",
      "bad"
    );
    return;
  }

  const point = transform(lat, lon);
  let object = state.objects.find((item) => item.id === state.selectedObjectId);
  if (!object) {
    object = { id: uid("obj"), title: "", lat: NaN, lon: NaN, x: NaN, y: NaN };
    state.objects.push(object);
  }

  object.title = title;
  object.lat = lat;
  object.lon = lon;
  object.x = point.x;
  object.y = point.y;
  state.selectedObjectId = object.id;
  objectTitle.value = title;
  objectLat.value = formatNumber(lat);
  objectLon.value = formatNumber(lon);

  setStatus(objectStatus, `${title} geplaatst op de SVG.`, "good");
  syncObjectsIntoSvg();
  renderAll();
  updateMapImage();
  persistDraft();
}

function deleteObject() {
  const index = state.objects.findIndex(
    (item) => item.id === state.selectedObjectId
  );
  if (index === -1) return;

  state.objects.splice(index, 1);
  state.selectedObjectId = "";
  newObject();
  syncObjectsIntoSvg();
  renderAll();
  updateMapImage();
  persistDraft();
}

function getToolGroup() {
  const root = state.svgDocument?.documentElement;
  if (!root) return null;

  let group = state.svgDocument.getElementById(TOOL_GROUP_ID);
  if (!group) {
    group = state.svgDocument.createElementNS(SVG_NS, "g");
    group.setAttribute("id", TOOL_GROUP_ID);
    group.setAttribute(TOOL_ATTR, "objects");
    root.appendChild(group);
  }
  return group;
}

function getReferenceGroup() {
  const root = state.svgDocument?.documentElement;
  if (!root) return null;

  let group = state.svgDocument.getElementById(REFERENCE_GROUP_ID);
  if (!group) {
    group = state.svgDocument.createElementNS(SVG_NS, "g");
    group.setAttribute("id", REFERENCE_GROUP_ID);
    group.setAttribute(TOOL_ATTR, "references");
    group.setAttribute("display", "none");
    root.appendChild(group);
  }
  return group;
}

function syncReferencesIntoSvg() {
  const group = getReferenceGroup();
  if (!group) return;
  group.textContent = "";
  group.setAttribute("display", "none");

  state.references.forEach((ref) => {
    if (![ref.lat, ref.lon, ref.x, ref.y].every(Number.isFinite)) {
      return;
    }

    const item = state.svgDocument.createElementNS(SVG_NS, "metadata");
    item.setAttribute(TOOL_ATTR, "reference");
    item.setAttribute("data-id", ref.id);
    item.setAttribute("data-name", ref.name);
    item.setAttribute("data-lat", formatNumber(ref.lat));
    item.setAttribute("data-lon", formatNumber(ref.lon));
    item.setAttribute("data-x", formatNumber(ref.x));
    item.setAttribute("data-y", formatNumber(ref.y));
    group.appendChild(item);
  });
}

function syncObjectsIntoSvg() {
  const group = getToolGroup();
  if (!group) return;
  group.textContent = "";

  state.objects.forEach((object) => {
    if (![object.x, object.y, object.lat, object.lon].every(Number.isFinite)) {
      return;
    }

    const item = state.svgDocument.createElementNS(SVG_NS, "g");
    item.setAttribute(TOOL_ATTR, "object");
    item.setAttribute("data-id", object.id);
    item.setAttribute("data-title", object.title);
    item.setAttribute("data-lat", formatNumber(object.lat));
    item.setAttribute("data-lon", formatNumber(object.lon));
    item.setAttribute("transform", `translate(${formatNumber(object.x)} ${formatNumber(object.y)})`);

    const title = state.svgDocument.createElementNS(SVG_NS, "title");
    title.textContent = object.title;
    item.appendChild(title);

    const circle = state.svgDocument.createElementNS(SVG_NS, "circle");
    circle.setAttribute("r", "8");
    circle.setAttribute("cx", "0");
    circle.setAttribute("cy", "0");
    circle.setAttribute("style", "fill:#ff1111;stroke:#ffffff;stroke-width:3");
    item.appendChild(circle);

    const text = state.svgDocument.createElementNS(SVG_NS, "text");
    text.setAttribute("x", "12");
    text.setAttribute("y", "-12");
    text.setAttribute("style", "font-family:Arial,Helvetica,sans-serif;font-size:18px;fill:#202124;paint-order:stroke;stroke:#ffffff;stroke-width:4px;stroke-linejoin:round");
    text.textContent = object.title;
    item.appendChild(text);

    group.appendChild(item);
  });
}

function readObjectsFromSvg(svgDocument) {
  return Array.from(svgDocument.querySelectorAll(`[${TOOL_ATTR}="object"]`))
    .map((node) => {
      const transform = node.getAttribute("transform") || "";
      const match = /translate\(([^)\s,]+)[,\s]+([^)]+)\)/.exec(transform);
      const x = match ? number(match[1]) : number(node.getAttribute("data-x"));
      const y = match ? number(match[2]) : number(node.getAttribute("data-y"));
      return {
        id: node.getAttribute("data-id") || uid("obj"),
        title:
          node.getAttribute("data-title") ||
          node.querySelector("title")?.textContent.trim() ||
          "Object",
        lat: number(node.getAttribute("data-lat")),
        lon: number(node.getAttribute("data-lon")),
        x,
        y,
      };
    })
    .filter((object) => Number.isFinite(object.x) && Number.isFinite(object.y));
}

function readReferencesFromSvg(svgDocument) {
  return Array.from(svgDocument.querySelectorAll(`[${TOOL_ATTR}="reference"]`))
    .map((node, index) => ({
      id: node.getAttribute("data-id") || uid("ref"),
      name: node.getAttribute("data-name") || `Punt ${index + 1}`,
      lat: number(node.getAttribute("data-lat")),
      lon: number(node.getAttribute("data-lon")),
      x: number(node.getAttribute("data-x")),
      y: number(node.getAttribute("data-y")),
    }))
    .filter((ref) => [ref.lat, ref.lon, ref.x, ref.y].every(Number.isFinite));
}

function nextReferenceNumberFrom(references) {
  const usedNumbers = references
    .map((ref) => /^Punt\s+(\d+)$/i.exec(ref.name || "")?.[1])
    .filter(Boolean)
    .map(Number);
  return usedNumbers.length > 0
    ? Math.max(...usedNumbers) + 1
    : references.length + 1;
}

function draftKey() {
  return state.fileName ? `geo-svg-draft:${state.fileName}` : "";
}

function persistDraft() {
  const key = draftKey();
  if (!key) return;
  localStorage.setItem(
    key,
    JSON.stringify({
      references: state.references,
      objects: state.objects,
      nextReferenceNumber: state.nextReferenceNumber,
    })
  );
}

function loadDraft() {
  const key = draftKey();
  if (!key) return;
  const raw = localStorage.getItem(key);
  if (!raw) return;

  try {
    const draft = JSON.parse(raw);
    if (Array.isArray(draft.references)) {
      if (state.references.length === 0) {
        state.references = draft.references;
        state.nextReferenceNumber =
          draft.nextReferenceNumber || nextReferenceNumberFrom(state.references);
        state.selectedReferenceId = state.references[0]?.id || "";
      }
    }
    if (Array.isArray(draft.objects) && state.objects.length === 0) {
      state.objects = draft.objects;
    }
  } catch {
    localStorage.removeItem(key);
  }
}

function renderReferences() {
  referenceSelect.textContent = "";
  const emptyOption = new Option("Geen punt geselecteerd", "");
  referenceSelect.appendChild(emptyOption);

  state.references.forEach((ref) => {
    referenceSelect.appendChild(new Option(ref.name, ref.id));
  });
  referenceSelect.value = state.selectedReferenceId;

  referenceList.textContent = "";
  state.references.forEach((ref) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = ref.id === state.selectedReferenceId ? "item active" : "item";
    button.innerHTML = `<strong>${ref.name}</strong><span>${formatNumber(
      ref.lat
    )}, ${formatNumber(ref.lon)} -> ${formatNumber(ref.x)}, ${formatNumber(
      ref.y
    )}</span>`;
    button.addEventListener("click", () => selectReference(ref.id));
    referenceList.appendChild(button);
  });

  deleteReferenceButton.disabled = !state.selectedReferenceId;
}

function renderObjects() {
  objectList.textContent = "";
  state.objects
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title))
    .forEach((object) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = object.id === state.selectedObjectId ? "item active" : "item";
      button.innerHTML = `<strong>${object.title}</strong><span>${formatNumber(
        object.lat
      )}, ${formatNumber(object.lon)}</span>`;
      button.addEventListener("click", () => selectObject(object.id));
      objectList.appendChild(button);
    });

  deleteObjectButton.disabled = !state.selectedObjectId;
}

function renderOverlay() {
  overlay.textContent = "";
  const transformReady = computeTransform();

  state.references.forEach((ref) => {
    if (!Number.isFinite(ref.x) || !Number.isFinite(ref.y)) return;

    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("class", "ref-marker");
    circle.setAttribute("cx", ref.x);
    circle.setAttribute("cy", ref.y);
    circle.setAttribute("r", 10);
    overlay.appendChild(circle);

    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("class", "ref-label");
    text.setAttribute("x", ref.x + 13);
    text.setAttribute("y", ref.y - 13);
    text.textContent = ref.name;
    overlay.appendChild(text);
  });

  state.objects.forEach((object) => {
    if (!Number.isFinite(object.x) || !Number.isFinite(object.y)) return;

    const hit = document.createElementNS(SVG_NS, "circle");
    hit.setAttribute(
      "class",
      object.id === state.selectedObjectId ? "object-hit active" : "object-hit"
    );
    hit.setAttribute("cx", object.x);
    hit.setAttribute("cy", object.y);
    hit.setAttribute("r", 18);
    hit.addEventListener("click", (event) => {
      event.stopPropagation();
      selectObject(object.id);
    });
    overlay.appendChild(hit);

    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("class", "object-marker");
    circle.setAttribute("cx", object.x);
    circle.setAttribute("cy", object.y);
    circle.setAttribute("r", 8);
    overlay.appendChild(circle);

    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("class", "object-label");
    text.setAttribute("x", object.x + 12);
    text.setAttribute("y", object.y - 12);
    text.textContent = object.title;
    overlay.appendChild(text);
  });

  saveObjectButton.disabled = !state.svgDocument || !transformReady;
  const refs = validReferences().length;
  if (!state.svgDocument) {
    setStatus(objectStatus, "Upload eerst een SVG.");
  } else if (refs < 2) {
    setStatus(objectStatus, "Minstens 2 referentiepunten nodig.");
  } else if (refs === 2) {
    setStatus(objectStatus, "Transformatie actief met 2 referentiepunten.", "good");
  } else {
    setStatus(objectStatus, "Affine transformatie actief met 3 referentiepunten.", "good");
  }
}

function renderAll() {
  renderReferences();
  renderObjects();
  renderOverlay();
}

function enableEditor(enabled) {
  downloadButton.disabled = !enabled;
  zoomOutButton.disabled = !enabled;
  zoomInButton.disabled = !enabled;
  zoomResetButton.disabled = !enabled;
  saveReferenceButton.disabled = !enabled;
  newReferenceButton.disabled = !enabled;
  saveObjectButton.disabled = true;
  newObjectButton.disabled = !enabled;
  deleteReferenceButton.disabled = !enabled || !state.selectedReferenceId;
  deleteObjectButton.disabled = !enabled || !state.selectedObjectId;
}

function loadSvgText(svgText, fileName) {
  const parser = new DOMParser();
  const svgDocument = parser.parseFromString(svgText, "image/svg+xml");
  if (svgDocument.querySelector("parsererror")) {
    setStatus(fileStatus, "Deze SVG kon niet gelezen worden.", "bad");
    return;
  }

  state.svgDocument = svgDocument;
  state.svgText = svgText;
  state.fileName = fileName;
  state.viewBox = readViewBox(svgDocument);
  state.references = readReferencesFromSvg(svgDocument);
  state.objects = readObjectsFromSvg(svgDocument);
  state.selectedReferenceId = state.references[0]?.id || "";
  state.selectedObjectId = "";
  state.nextReferenceNumber = nextReferenceNumberFrom(state.references);
  state.zoom = 1;

  loadDraft();
  if (state.references.length === 0) newReference();
  setViewBox(state.viewBox);
  enableEditor(true);
  syncReferencesIntoSvg();
  syncObjectsIntoSvg();
  updateMapImage();
  renderAll();

  const [minX, minY, width, height] = state.viewBox;
  setStatus(fileStatus, `${fileName} geladen.`, "good");
  setStatus(
    mapStatus,
    `ViewBox ${formatNumber(minX)} ${formatNumber(minY)} ${formatNumber(
      width
    )} ${formatNumber(height)}.`
  );
}

function downloadSvg() {
  const svgText = serializeSvg();
  const blob = new Blob([svgText], { type: "image/svg+xml" });
  const link = document.createElement("a");
  const baseName = state.fileName.replace(/\.svg$/i, "") || "kaart";
  link.href = URL.createObjectURL(blob);
  link.download = `${baseName}-met-objecten.svg`;
  link.click();
  URL.revokeObjectURL(link.href);
}

svgFileEl.addEventListener("change", () => {
  const file = svgFileEl.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => loadSvgText(String(reader.result), file.name));
  reader.readAsText(file);
});

overlay.addEventListener("click", (event) => {
  if (!state.svgDocument) return;
  if (!state.selectedReferenceId) newReference();
  const point = getPointerSvgPoint(event);
  referenceX.value = formatNumber(point.x);
  referenceY.value = formatNumber(point.y);
  const ref = state.references.find(
    (item) => item.id === state.selectedReferenceId
  );
  if (ref) {
    ref.x = point.x;
    ref.y = point.y;
  }
  setStatus(
    mapStatus,
    "Referentiepunt geplaatst. Vul latitude en longitude in en bewaar.",
    "good"
  );
  referenceLat.focus();
  renderAll();
});

referenceSelect.addEventListener("change", () => selectReference(referenceSelect.value));
saveReferenceButton.addEventListener("click", saveReference);
newReferenceButton.addEventListener("click", newReference);
deleteReferenceButton.addEventListener("click", deleteReference);
saveObjectButton.addEventListener("click", saveObject);
newObjectButton.addEventListener("click", newObject);
deleteObjectButton.addEventListener("click", deleteObject);
downloadButton.addEventListener("click", downloadSvg);
zoomOutButton.addEventListener("click", () => setZoom(state.zoom / 1.25));
zoomInButton.addEventListener("click", () => setZoom(state.zoom * 1.25));
zoomResetButton.addEventListener("click", () => setZoom(1));

enableEditor(false);
updateZoomDisplay();
renderAll();
