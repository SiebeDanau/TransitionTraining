const SVG_NS = "http://www.w3.org/2000/svg";
const TOOL_GROUP_ID = "geo-svg-tool-objects";
const REFERENCE_GROUP_ID = "geo-svg-tool-references";
const COMPLEX_GROUP_ID = "geo-svg-tool-complex-objects";
const TOOL_ATTR = "data-geo-svg-tool";
const DEFAULT_OBJECT_SIZE = 8;
const DEFAULT_OBJECT_SHAPE = "circle";
const DEFAULT_OBJECT_COLOR = "#ff1111";
const OBJECT_SHAPES = [
  ["circle", "Cirkel"],
  ["triangle", "Driehoek"],
  ["square", "Vierkant"],
  ["plus", "+"],
  ["x", "x"],
  ["diamond", "Ruit"],
];

const state = {
  svgDocument: null,
  svgText: "",
  fileName: "",
  viewBox: [0, 0, 100, 100],
  references: [],
  objects: [],
  complexObjects: [],
  selectedReferenceId: "",
  selectedObjectId: "",
  selectedComplexObjectId: "",
  selectedComplexPointIndex: -1,
  nextReferenceNumber: 1,
  nextComplexObjectNumber: 1,
  blindMap: false,
  referencePlacementArmed: false,
  complexMapPointArmed: false,
  objectDefaults: {
    size: DEFAULT_OBJECT_SIZE,
    shape: DEFAULT_OBJECT_SHAPE,
    color: DEFAULT_OBJECT_COLOR,
  },
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
const positionReferenceButton = document.querySelector("#positionReferenceButton");
const deleteReferenceButton = document.querySelector("#deleteReferenceButton");
const referenceList = document.querySelector("#referenceList");
const objectTitle = document.querySelector("#objectTitle");
const blindMap = document.querySelector("#blindMap");
const objectLat = document.querySelector("#objectLat");
const objectLon = document.querySelector("#objectLon");
const objectSize = document.querySelector("#objectSize");
const objectShape = document.querySelector("#objectShape");
const objectColor = document.querySelector("#objectColor");
const saveObjectButton = document.querySelector("#saveObjectButton");
const newObjectButton = document.querySelector("#newObjectButton");
const deleteObjectButton = document.querySelector("#deleteObjectButton");
const objectStatus = document.querySelector("#objectStatus");
const objectList = document.querySelector("#objectList");
const globalObjectSize = document.querySelector("#globalObjectSize");
const globalObjectShape = document.querySelector("#globalObjectShape");
const globalObjectColor = document.querySelector("#globalObjectColor");
const applyGlobalObjectStyleButton = document.querySelector("#applyGlobalObjectStyleButton");
const complexTitle = document.querySelector("#complexTitle");
const complexLat = document.querySelector("#complexLat");
const complexLon = document.querySelector("#complexLon");
const addComplexCoordinateButton = document.querySelector("#addComplexCoordinateButton");
const updateComplexPointButton = document.querySelector("#updateComplexPointButton");
const addComplexMapPointButton = document.querySelector("#addComplexMapPointButton");
const closeComplexObjectButton = document.querySelector("#closeComplexObjectButton");
const newComplexObjectButton = document.querySelector("#newComplexObjectButton");
const deleteComplexObjectButton = document.querySelector("#deleteComplexObjectButton");
const complexStatus = document.querySelector("#complexStatus");
const complexList = document.querySelector("#complexList");
const complexPointList = document.querySelector("#complexPointList");
const newComplexObjectDialog = document.querySelector("#newComplexObjectDialog");
const newComplexObjectForm = document.querySelector("#newComplexObjectForm");
const newComplexObjectName = document.querySelector("#newComplexObjectName");
const cancelNewComplexObjectButton = document.querySelector("#cancelNewComplexObjectButton");

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

function normalizeSize(value) {
  const size = number(value);
  return Number.isFinite(size) ? Math.min(80, Math.max(2, size)) : DEFAULT_OBJECT_SIZE;
}

function normalizeShape(value) {
  return OBJECT_SHAPES.some(([shape]) => shape === value)
    ? value
    : DEFAULT_OBJECT_SHAPE;
}

function normalizeColor(value) {
  const text = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : DEFAULT_OBJECT_COLOR;
}

function objectStyleFromFields() {
  return {
    size: normalizeSize(objectSize.value),
    shape: normalizeShape(objectShape.value),
    color: normalizeColor(objectColor.value),
  };
}

function normalizeObjectStyle(object) {
  object.size = normalizeSize(object.size ?? state.objectDefaults.size);
  object.shape = normalizeShape(object.shape ?? state.objectDefaults.shape);
  object.color = normalizeColor(object.color ?? state.objectDefaults.color);
  return object;
}

function setStatus(element, text, type = "") {
  element.textContent = text;
  element.className = type ? `status ${type}` : "status";
}

function populateShapeSelect(select) {
  select.textContent = "";
  OBJECT_SHAPES.forEach(([value, label]) => {
    select.appendChild(new Option(label, value));
  });
}

function syncDefaultStyleControls() {
  globalObjectSize.value = state.objectDefaults.size;
  globalObjectShape.value = state.objectDefaults.shape;
  globalObjectColor.value = state.objectDefaults.color;
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
  syncComplexObjectsIntoSvg();
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
  state.referencePlacementArmed = false;
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
  if (object) normalizeObjectStyle(object);
  objectTitle.value = object ? object.title : "";
  objectLat.value = object ? formatNumber(object.lat) : "";
  objectLon.value = object ? formatNumber(object.lon) : "";
  objectSize.value = object ? formatNumber(object.size) : state.objectDefaults.size;
  objectShape.value = object ? object.shape : state.objectDefaults.shape;
  objectColor.value = object ? object.color : state.objectDefaults.color;
  deleteObjectButton.disabled = !object;
  renderObjects();
}

function clearSelections() {
  state.selectedReferenceId = "";
  state.selectedObjectId = "";
  state.selectedComplexObjectId = "";
  state.selectedComplexPointIndex = -1;
  state.referencePlacementArmed = false;
  state.complexMapPointArmed = false;
  referenceSelect.value = "";
  referenceLat.value = "";
  referenceLon.value = "";
  referenceX.value = "";
  referenceY.value = "";
  objectTitle.value = "";
  objectLat.value = "";
  objectLon.value = "";
  objectSize.value = state.objectDefaults.size;
  objectShape.value = state.objectDefaults.shape;
  objectColor.value = state.objectDefaults.color;
  complexTitle.value = "";
  complexLat.value = "";
  complexLon.value = "";
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
  if (refs.length < 3) return null;

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
  objectSize.value = state.objectDefaults.size;
  objectShape.value = state.objectDefaults.shape;
  objectColor.value = state.objectDefaults.color;
  deleteObjectButton.disabled = true;
  renderObjects();
}

function nextObjectTitle() {
  return `Object ${state.objects.length + 1}`;
}

function nextComplexObjectTitle() {
  return `Complex object ${state.nextComplexObjectNumber}`;
}

function selectComplexObject(id) {
  state.selectedComplexObjectId = id;
  state.selectedComplexPointIndex = -1;
  state.complexMapPointArmed = false;
  const object = state.complexObjects.find((item) => item.id === id);
  complexTitle.value = object ? object.title : "";
  renderComplexObjects();
  renderOverlay();
  setComplexEditorEnabled();
}

function selectComplexPoint(index) {
  const object = state.complexObjects.find(
    (item) => item.id === state.selectedComplexObjectId
  );
  const points = object ? editableComplexPoints(object) : [];
  if (!object || index < 0 || index >= points.length) {
    state.selectedComplexPointIndex = -1;
    renderComplexObjects();
    renderOverlay();
    setComplexEditorEnabled();
    return;
  }

  state.selectedComplexPointIndex = index;
  complexLat.value = "";
  complexLon.value = "";
  setStatus(
    complexStatus,
    `Punt ${index + 1} geselecteerd. Vul nieuwe coordinaten in en kies "Werk punt bij", of klik "Voeg punt op kaart toe".`,
    "good"
  );
  renderComplexObjects();
  renderOverlay();
  setComplexEditorEnabled();
}

function createComplexObject(title = nextComplexObjectTitle()) {
  const object = {
    id: uid("complex"),
    title,
    points: [],
    closed: false,
  };
  state.nextComplexObjectNumber += 1;
  state.complexObjects.push(object);
  selectComplexObject(object.id);
  setStatus(complexStatus, "Voeg punten toe via coordinaten of via de kaart.", "good");
  syncComplexObjectsIntoSvg();
  updateMapImage();
  persistDraft();
}

function newComplexObject() {
  const defaultTitle = nextComplexObjectTitle();
  newComplexObjectName.value = defaultTitle;
  if (typeof newComplexObjectDialog.showModal === "function") {
    newComplexObjectDialog.showModal();
    newComplexObjectName.focus();
    newComplexObjectName.select();
  } else {
    createComplexObject(defaultTitle);
  }
}

function selectedComplexObject() {
  let object = state.complexObjects.find(
    (item) => item.id === state.selectedComplexObjectId
  );
  if (!object) {
    createComplexObject();
    object = state.complexObjects.find(
      (item) => item.id === state.selectedComplexObjectId
    );
  }
  return object;
}

function currentComplexObject() {
  return state.complexObjects.find(
    (item) => item.id === state.selectedComplexObjectId
  );
}

function setComplexEditorEnabled() {
  const editorReady = Boolean(state.svgDocument);
  const selected = currentComplexObject();
  const selectedPoints = selected ? editableComplexPoints(selected) : [];
  const hasSelection = editorReady && Boolean(selected);

  newComplexObjectButton.disabled = !editorReady;
  complexTitle.disabled = !hasSelection;
  complexLat.disabled = !hasSelection;
  complexLon.disabled = !hasSelection;
  addComplexCoordinateButton.disabled = !hasSelection;
  addComplexMapPointButton.disabled = !hasSelection;
  deleteComplexObjectButton.disabled = !hasSelection;
  closeComplexObjectButton.disabled = !hasSelection || selectedPoints.length < 3;
  updateComplexPointButton.disabled =
    !hasSelection ||
    state.selectedComplexPointIndex < 0 ||
    state.selectedComplexPointIndex >= selectedPoints.length;

  if (!selected) {
    complexTitle.value = "";
    complexLat.value = "";
    complexLon.value = "";
  }
}

function samePoint(a, b) {
  return a && b && Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
}

function editableComplexPoints(object) {
  if (
    object.closed &&
    object.points.length > 1 &&
    samePoint(object.points[0], object.points[object.points.length - 1])
  ) {
    return object.points.slice(0, -1);
  }
  return object.points;
}

function addComplexPoint(point, mode = "auto") {
  const object = selectedComplexObject();
  if (!object) return;

  object.points = editableComplexPoints(object);
  object.title = complexTitle.value.trim() || object.title || nextComplexObjectTitle();
  const shouldUpdate =
    mode !== "add" &&
    state.selectedComplexPointIndex >= 0 &&
    state.selectedComplexPointIndex < object.points.length;
  if (shouldUpdate) {
    object.points[state.selectedComplexPointIndex] = { x: point.x, y: point.y };
  } else {
    object.points.push({ x: point.x, y: point.y });
    state.selectedComplexPointIndex = object.points.length - 1;
  }
  object.closed = false;
  complexTitle.value = object.title;
  state.complexMapPointArmed = false;
  renderAll();
  syncComplexObjectsIntoSvg();
  updateMapImage();
  const pointCount = editableComplexPoints(object).length;
  setStatus(
    complexStatus,
    `${object.title}: ${pointCount} punt${pointCount === 1 ? "" : "en"}.`,
    "good"
  );
  persistDraft();
}

function updateSelectedComplexPoint() {
  if (!currentComplexObject()) {
    setStatus(complexStatus, "Selecteer eerst een complex object.", "bad");
    setComplexEditorEnabled();
    return;
  }

  if (state.selectedComplexPointIndex < 0) {
    setStatus(complexStatus, "Selecteer eerst een punt uit de puntenlijst.", "bad");
    return;
  }
  const transform = computeTransform();
  if (!transform) {
    setStatus(complexStatus, "Minstens 3 geldige referentiepunten nodig.", "bad");
    return;
  }

  const coordinates = coordinatePairFromFields(complexLat.value, complexLon.value);
  if (!Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lon)) {
    setStatus(
      complexStatus,
      "Vul coordinaten in, bijvoorbeeld 502032N en 0034030E.",
      "bad"
    );
    return;
  }

  addComplexPoint(transform(coordinates.lat, coordinates.lon), "update");
  complexLat.value = formatNumber(coordinates.lat);
  complexLon.value = formatNumber(coordinates.lon);
}

function addComplexCoordinatePoint() {
  if (!currentComplexObject()) {
    setStatus(complexStatus, "Selecteer eerst een complex object.", "bad");
    setComplexEditorEnabled();
    return;
  }

  const transform = computeTransform();
  if (!transform) {
    setStatus(complexStatus, "Minstens 3 geldige referentiepunten nodig.", "bad");
    return;
  }

  const coordinates = coordinatePairFromFields(complexLat.value, complexLon.value);
  if (!Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lon)) {
    setStatus(
      complexStatus,
      "Vul coordinaten in, bijvoorbeeld 502032N en 0034030E.",
      "bad"
    );
    return;
  }

  addComplexPoint(transform(coordinates.lat, coordinates.lon), "add");
  complexLat.value = formatNumber(coordinates.lat);
  complexLon.value = formatNumber(coordinates.lon);
}

function armComplexMapPoint() {
  if (!state.svgDocument) return;
  if (!currentComplexObject()) {
    setStatus(complexStatus, "Selecteer eerst een complex object.", "bad");
    setComplexEditorEnabled();
    return;
  }
  state.referencePlacementArmed = false;
  state.complexMapPointArmed = true;
  setStatus(complexStatus, "Klik op de kaart om het volgende punt toe te voegen.", "good");
}

function closeComplexObject() {
  const object = currentComplexObject();
  if (!object || editableComplexPoints(object).length < 3) {
    setStatus(complexStatus, "Minstens 3 punten nodig om te sluiten.", "bad");
    setComplexEditorEnabled();
    return;
  }

  object.title = complexTitle.value.trim() || object.title;
  object.points = editableComplexPoints(object);
  object.points.push({ ...object.points[0] });
  object.closed = true;
  state.complexMapPointArmed = false;
  renderAll();
  syncComplexObjectsIntoSvg();
  updateMapImage();
  setStatus(complexStatus, `${object.title} gesloten.`, "good");
  persistDraft();
}

function deleteComplexObject() {
  const index = state.complexObjects.findIndex(
    (item) => item.id === state.selectedComplexObjectId
  );
  if (index === -1) return;

  state.complexObjects.splice(index, 1);
  selectComplexObject("");
  setStatus(complexStatus, "Complex object verwijderd.");
  syncComplexObjectsIntoSvg();
  updateMapImage();
  persistDraft();
}

function saveObject() {
  const transform = computeTransform();
  if (!transform) {
    setStatus(objectStatus, "Minstens 3 geldige referentiepunten nodig.", "bad");
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
    object = {
      id: uid("obj"),
      title: "",
      lat: NaN,
      lon: NaN,
      x: NaN,
      y: NaN,
      ...state.objectDefaults,
    };
    state.objects.push(object);
  }

  const style = objectStyleFromFields();
  object.title = title;
  object.lat = lat;
  object.lon = lon;
  object.x = point.x;
  object.y = point.y;
  object.size = style.size;
  object.shape = style.shape;
  object.color = style.color;
  state.selectedObjectId = object.id;
  objectTitle.value = title;
  objectLat.value = formatNumber(lat);
  objectLon.value = formatNumber(lon);
  objectSize.value = formatNumber(object.size);
  objectShape.value = object.shape;
  objectColor.value = object.color;

  setStatus(objectStatus, `${title} geplaatst op de SVG.`, "good");
  syncObjectsIntoSvg();
  renderAll();
  updateMapImage();
  persistDraft();
}

function armReferencePlacement() {
  if (!state.svgDocument) return;
  let ref = state.references.find((item) => item.id === state.selectedReferenceId);
  if (!ref) {
    newReference();
    ref = state.references.find((item) => item.id === state.selectedReferenceId);
  }
  if (!ref) return;

  const hasPosition = Number.isFinite(ref.x) && Number.isFinite(ref.y);
  if (
    hasPosition &&
    !window.confirm(
      `Je gaat ${ref.name} verplaatsen. Dit kan de transformatie van alle objecten beinvloeden. Wil je doorgaan?`
    )
  ) {
    return;
  }

  state.referencePlacementArmed = true;
  setStatus(mapStatus, `Klik nu op de SVG om ${ref.name} te plaatsen.`, "good");
}

function applyGlobalObjectStyle() {
  state.objectDefaults = {
    size: normalizeSize(globalObjectSize.value),
    shape: normalizeShape(globalObjectShape.value),
    color: normalizeColor(globalObjectColor.value),
  };

  state.objects.forEach((object) => {
    object.size = state.objectDefaults.size;
    object.shape = state.objectDefaults.shape;
    object.color = state.objectDefaults.color;
  });

  globalObjectSize.value = state.objectDefaults.size;
  globalObjectShape.value = state.objectDefaults.shape;
  globalObjectColor.value = state.objectDefaults.color;
  selectObject(state.selectedObjectId);
  syncObjectsIntoSvg();
  renderAll();
  updateMapImage();
  persistDraft();
}

function applySelectedObjectStyle() {
  const object = state.objects.find((item) => item.id === state.selectedObjectId);
  if (!object) return;

  const style = objectStyleFromFields();
  object.size = style.size;
  object.shape = style.shape;
  object.color = style.color;
  objectSize.value = formatNumber(object.size);
  objectShape.value = object.shape;
  objectColor.value = object.color;

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

function createObjectMarker(svgDocument, object, className = "object-marker") {
  const style = normalizeObjectStyle(object);
  const size = style.size;
  const half = size;
  const strokeWidth = Math.max(2, size * 0.28);
  let marker;

  if (style.shape === "triangle") {
    marker = svgDocument.createElementNS(SVG_NS, "polygon");
    marker.setAttribute(
      "points",
      `0 ${formatNumber(-half)} ${formatNumber(half)} ${formatNumber(half)} ${formatNumber(-half)} ${formatNumber(half)}`
    );
    marker.setAttribute("style", `fill:${style.color}`);
  } else if (style.shape === "square") {
    marker = svgDocument.createElementNS(SVG_NS, "rect");
    marker.setAttribute("x", formatNumber(-half));
    marker.setAttribute("y", formatNumber(-half));
    marker.setAttribute("width", formatNumber(size * 2));
    marker.setAttribute("height", formatNumber(size * 2));
    marker.setAttribute("style", `fill:${style.color}`);
  } else if (style.shape === "plus") {
    marker = svgDocument.createElementNS(SVG_NS, "path");
    marker.setAttribute(
      "d",
      `M ${formatNumber(-half)} 0 H ${formatNumber(half)} M 0 ${formatNumber(-half)} V ${formatNumber(half)}`
    );
    marker.setAttribute(
      "style",
      `fill:none;stroke:${style.color};stroke-width:${formatNumber(strokeWidth)};stroke-linecap:round`
    );
  } else if (style.shape === "x") {
    marker = svgDocument.createElementNS(SVG_NS, "path");
    marker.setAttribute(
      "d",
      `M ${formatNumber(-half)} ${formatNumber(-half)} L ${formatNumber(half)} ${formatNumber(half)} M ${formatNumber(half)} ${formatNumber(-half)} L ${formatNumber(-half)} ${formatNumber(half)}`
    );
    marker.setAttribute(
      "style",
      `fill:none;stroke:${style.color};stroke-width:${formatNumber(strokeWidth)};stroke-linecap:round`
    );
  } else if (style.shape === "diamond") {
    marker = svgDocument.createElementNS(SVG_NS, "polygon");
    marker.setAttribute(
      "points",
      `0 ${formatNumber(-half)} ${formatNumber(half)} 0 0 ${formatNumber(half)} ${formatNumber(-half)} 0`
    );
    marker.setAttribute("style", `fill:${style.color}`);
  } else {
    marker = svgDocument.createElementNS(SVG_NS, "circle");
    marker.setAttribute("r", formatNumber(size));
    marker.setAttribute("cx", "0");
    marker.setAttribute("cy", "0");
    marker.setAttribute("style", `fill:${style.color}`);
  }

  if (className) marker.setAttribute("class", className);
  return marker;
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

function getComplexGroup() {
  const root = state.svgDocument?.documentElement;
  if (!root) return null;

  let group = state.svgDocument.getElementById(COMPLEX_GROUP_ID);
  if (!group) {
    group = state.svgDocument.createElementNS(SVG_NS, "g");
    group.setAttribute("id", COMPLEX_GROUP_ID);
    group.setAttribute(TOOL_ATTR, "complex-objects");
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
  group.setAttribute("data-blind-map", state.blindMap ? "true" : "false");

  state.objects.forEach((object) => {
    if (![object.x, object.y, object.lat, object.lon].every(Number.isFinite)) {
      return;
    }
    normalizeObjectStyle(object);

    const item = state.svgDocument.createElementNS(SVG_NS, "g");
    item.setAttribute(TOOL_ATTR, "object");
    item.setAttribute("data-id", object.id);
    item.setAttribute("data-title", object.title);
    item.setAttribute("data-lat", formatNumber(object.lat));
    item.setAttribute("data-lon", formatNumber(object.lon));
    item.setAttribute("data-size", formatNumber(object.size));
    item.setAttribute("data-shape", object.shape);
    item.setAttribute("data-color", object.color);
    item.setAttribute("transform", `translate(${formatNumber(object.x)} ${formatNumber(object.y)})`);

    const title = state.svgDocument.createElementNS(SVG_NS, "title");
    title.textContent = object.title;
    item.appendChild(title);

    item.appendChild(createObjectMarker(state.svgDocument, object, ""));

    group.appendChild(item);

    if (state.blindMap) return;

    const label = state.svgDocument.createElementNS(SVG_NS, "g");
    label.setAttribute(TOOL_ATTR, "object-label");
    label.setAttribute("data-id", `${object.id}-label`);
    label.setAttribute("data-object-id", object.id);
    label.setAttribute("data-title", object.title);
    label.setAttribute("transform", `translate(${formatNumber(object.x)} ${formatNumber(object.y)})`);

    const labelTitle = state.svgDocument.createElementNS(SVG_NS, "title");
    labelTitle.textContent = `${object.title} label`;
    label.appendChild(labelTitle);

    const text = state.svgDocument.createElementNS(SVG_NS, "text");
    text.setAttribute("x", formatNumber(object.size + 4));
    text.setAttribute("y", formatNumber(-object.size - 4));
    text.setAttribute("style", "font-family:Arial,Helvetica,sans-serif;font-size:18px;fill:#202124;paint-order:stroke;stroke:#ffffff;stroke-width:4px;stroke-linejoin:round");
    text.textContent = object.title;
    label.appendChild(text);
    group.appendChild(label);
  });
}

function syncComplexObjectsIntoSvg() {
  const group = getComplexGroup();
  if (!group) return;
  group.textContent = "";
  group.setAttribute("display", "none");

  state.complexObjects.forEach((object) => {
    const points = Array.isArray(object.points)
      ? object.points.filter((point) => [point.x, point.y].every(Number.isFinite))
      : [];
    if (points.length === 0) return;

    const item = state.svgDocument.createElementNS(SVG_NS, "metadata");
    item.setAttribute(TOOL_ATTR, "complex-object");
    item.setAttribute("data-id", object.id);
    item.setAttribute("data-title", object.title);
    item.setAttribute("data-closed", object.closed ? "true" : "false");
    item.textContent = JSON.stringify({
      points: points.map((point) => ({
        x: Number(formatNumber(point.x)),
        y: Number(formatNumber(point.y)),
      })),
    });
    group.appendChild(item);
  });
}

function readBlindMapFromSvg(svgDocument) {
  const group = svgDocument.getElementById(TOOL_GROUP_ID);
  if (!group) return false;
  return group.getAttribute("data-blind-map") === "true";
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
        size: normalizeSize(node.getAttribute("data-size")),
        shape: normalizeShape(node.getAttribute("data-shape")),
        color: normalizeColor(node.getAttribute("data-color")),
        x,
        y,
      };
    })
    .filter((object) => Number.isFinite(object.x) && Number.isFinite(object.y));
}

function normalizeComplexObject(object, index = 0) {
  const points = Array.isArray(object.points)
    ? object.points
        .map((point) => ({
          x: number(point.x),
          y: number(point.y),
        }))
        .filter((point) => [point.x, point.y].every(Number.isFinite))
    : [];

  return {
    id: object.id || uid("complex"),
    title: object.title || `Complex object ${index + 1}`,
    points,
    closed: Boolean(object.closed),
  };
}

function readComplexObjectsFromSvg(svgDocument) {
  return Array.from(svgDocument.querySelectorAll(`[${TOOL_ATTR}="complex-object"]`))
    .map((node, index) => {
      let data = {};
      try {
        data = JSON.parse(node.textContent || "{}");
      } catch {
        data = {};
      }

      return normalizeComplexObject(
        {
          id: node.getAttribute("data-id") || "",
          title: node.getAttribute("data-title") || "",
          closed: node.getAttribute("data-closed") === "true",
          points: data.points,
        },
        index
      );
    })
    .filter((object) => object.points.length > 0);
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
      complexObjects: state.complexObjects,
      nextReferenceNumber: state.nextReferenceNumber,
      nextComplexObjectNumber: state.nextComplexObjectNumber,
      blindMap: state.blindMap,
      objectDefaults: state.objectDefaults,
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
      }
    }
    if (Array.isArray(draft.objects) && state.objects.length === 0) {
      state.objects = draft.objects;
    }
    if (Array.isArray(draft.complexObjects) && state.complexObjects.length === 0) {
      state.complexObjects = draft.complexObjects
        .map((object, index) => normalizeComplexObject(object, index))
        .filter((object) => object.points.length > 0 || object.title);
      state.nextComplexObjectNumber =
        draft.nextComplexObjectNumber || state.complexObjects.length + 1;
    }
    if (typeof draft.blindMap === "boolean") {
      state.blindMap = draft.blindMap;
    }
    if (draft.objectDefaults && typeof draft.objectDefaults === "object") {
      state.objectDefaults = {
        size: normalizeSize(draft.objectDefaults.size),
        shape: normalizeShape(draft.objectDefaults.shape),
        color: normalizeColor(draft.objectDefaults.color),
      };
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
  positionReferenceButton.disabled = !state.svgDocument || !state.selectedReferenceId;
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

function renderComplexObjects() {
  complexList.textContent = "";
  complexPointList.textContent = "";
  state.complexObjects.forEach((object) => {
    const pointCount = editableComplexPoints(object).length;
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      object.id === state.selectedComplexObjectId ? "item active" : "item";
    button.innerHTML = `<strong>${object.title}</strong><span>${pointCount} punt${pointCount === 1 ? "" : "en"}${object.closed ? " - gesloten" : ""}</span>`;
    button.addEventListener("click", () => selectComplexObject(object.id));
    complexList.appendChild(button);
  });

  const selected = state.complexObjects.find(
    (object) => object.id === state.selectedComplexObjectId
  );

  if (selected) {
    editableComplexPoints(selected).forEach((point, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        index === state.selectedComplexPointIndex ? "item active" : "item";
      button.innerHTML = `<strong>Punt ${index + 1}</strong><span>SVG ${formatNumber(
        point.x
      )}, ${formatNumber(point.y)}</span>`;
      button.addEventListener("click", () => selectComplexPoint(index));
      complexPointList.appendChild(button);
    });
  }

  setComplexEditorEnabled();
}

function pointList(points) {
  return points
    .map((point) => `${formatNumber(point.x)},${formatNumber(point.y)}`)
    .join(" ");
}

function renderComplexObjectOverlay(object) {
  if (object.points.length === 0) return;

  const isClosed = object.closed && object.points.length >= 3;
  const shape = document.createElementNS(
    SVG_NS,
    isClosed ? "polygon" : "polyline"
  );
  shape.setAttribute("class", isClosed ? "complex-object" : "complex-object open");
  shape.setAttribute("points", pointList(object.points));
  overlay.appendChild(shape);

  editableComplexPoints(object).forEach((point, index) => {
    const node = document.createElementNS(SVG_NS, "circle");
    const active =
      object.id === state.selectedComplexObjectId &&
      index === state.selectedComplexPointIndex;
    node.setAttribute("class", active ? "complex-node active" : "complex-node");
    node.setAttribute("cx", point.x);
    node.setAttribute("cy", point.y);
    node.setAttribute(
      "r",
      active
        ? 8
        : index === 0
          ? 6
          : 4
    );
    overlay.appendChild(node);
  });
}

function renderOverlay() {
  overlay.textContent = "";
  overlay.classList.toggle(
    "click-target",
    state.referencePlacementArmed || state.complexMapPointArmed
  );
  const transformReady = computeTransform();

  state.references.forEach((ref) => {
    if (!Number.isFinite(ref.x) || !Number.isFinite(ref.y)) return;

    const size = 12;
    const marker = document.createElementNS(SVG_NS, "path");
    marker.setAttribute("class", "ref-marker");
    marker.setAttribute(
      "d",
      `M ${formatNumber(ref.x - size)} ${formatNumber(ref.y)} H ${formatNumber(ref.x + size)} M ${formatNumber(ref.x)} ${formatNumber(ref.y - size)} V ${formatNumber(ref.y + size)}`
    );
    overlay.appendChild(marker);

    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("class", "ref-label");
    text.setAttribute("x", ref.x + 13);
    text.setAttribute("y", ref.y - 13);
    text.textContent = ref.name;
    overlay.appendChild(text);
  });

  state.objects.forEach((object) => {
    if (!Number.isFinite(object.x) || !Number.isFinite(object.y)) return;
    normalizeObjectStyle(object);

    const hit = document.createElementNS(SVG_NS, "circle");
    hit.setAttribute(
      "class",
      object.id === state.selectedObjectId ? "object-hit active" : "object-hit"
    );
    hit.setAttribute("cx", object.x);
    hit.setAttribute("cy", object.y);
    hit.setAttribute("r", Math.max(18, object.size + 10));
    hit.addEventListener("click", (event) => {
      event.stopPropagation();
      selectObject(object.id);
    });
    overlay.appendChild(hit);

    const markerGroup = document.createElementNS(SVG_NS, "g");
    markerGroup.setAttribute("transform", `translate(${formatNumber(object.x)} ${formatNumber(object.y)})`);
    markerGroup.appendChild(createObjectMarker(document, object));
    overlay.appendChild(markerGroup);

    if (!state.blindMap) {
      const text = document.createElementNS(SVG_NS, "text");
      text.setAttribute("class", "object-label");
      text.setAttribute("x", object.x + object.size + 4);
      text.setAttribute("y", object.y - object.size - 4);
      text.textContent = object.title;
      overlay.appendChild(text);
    }
  });

  state.complexObjects.forEach(renderComplexObjectOverlay);

  saveObjectButton.disabled = !state.svgDocument || !transformReady;
  const refs = validReferences().length;
  if (!state.svgDocument) {
    setStatus(objectStatus, "Upload eerst een SVG.");
    setStatus(complexStatus, "Upload eerst een SVG.");
  } else if (refs < 3) {
    setStatus(objectStatus, "Minstens 3 referentiepunten nodig.");
    setStatus(complexStatus, "Minstens 3 referentiepunten nodig voor coordinaten.");
  } else {
    setStatus(objectStatus, "Affine transformatie actief met 3 of meer referentiepunten.", "good");
    setStatus(complexStatus, "Complex object kan via coordinaten of kaartklik worden opgebouwd.", "good");
  }
}

function renderAll() {
  renderReferences();
  renderObjects();
  renderComplexObjects();
  renderOverlay();
}

function enableEditor(enabled) {
  downloadButton.disabled = !enabled;
  zoomOutButton.disabled = !enabled;
  zoomInButton.disabled = !enabled;
  zoomResetButton.disabled = !enabled;
  saveReferenceButton.disabled = !enabled;
  newReferenceButton.disabled = !enabled;
  positionReferenceButton.disabled = !enabled || !state.selectedReferenceId;
  saveObjectButton.disabled = true;
  newObjectButton.disabled = !enabled;
  blindMap.disabled = !enabled;
  objectSize.disabled = !enabled;
  objectShape.disabled = !enabled;
  objectColor.disabled = !enabled;
  globalObjectSize.disabled = !enabled;
  globalObjectShape.disabled = !enabled;
  globalObjectColor.disabled = !enabled;
  applyGlobalObjectStyleButton.disabled = !enabled;
  deleteReferenceButton.disabled = !enabled || !state.selectedReferenceId;
  deleteObjectButton.disabled = !enabled || !state.selectedObjectId;
  setComplexEditorEnabled();
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
  state.complexObjects = readComplexObjectsFromSvg(svgDocument);
  state.blindMap = readBlindMapFromSvg(svgDocument);
  state.referencePlacementArmed = false;
  state.complexMapPointArmed = false;
  state.objectDefaults = {
    size: DEFAULT_OBJECT_SIZE,
    shape: DEFAULT_OBJECT_SHAPE,
    color: DEFAULT_OBJECT_COLOR,
  };
  state.objects.forEach(normalizeObjectStyle);
  state.selectedReferenceId = "";
  state.selectedObjectId = "";
  state.selectedComplexObjectId = "";
  state.selectedComplexPointIndex = -1;
  state.nextReferenceNumber = nextReferenceNumberFrom(state.references);
  state.nextComplexObjectNumber = state.complexObjects.length + 1;
  state.zoom = 1;

  loadDraft();
  blindMap.checked = state.blindMap;
  syncDefaultStyleControls();
  if (state.references.length === 0) {
    state.references.push({
      id: uid("ref"),
      name: `Punt ${state.nextReferenceNumber}`,
      lat: NaN,
      lon: NaN,
      x: NaN,
      y: NaN,
    });
    state.nextReferenceNumber += 1;
  }
  clearSelections();
  setViewBox(state.viewBox);
  enableEditor(true);
  syncReferencesIntoSvg();
  syncObjectsIntoSvg();
  syncComplexObjectsIntoSvg();
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
  if (state.complexMapPointArmed) {
    addComplexPoint(getPointerSvgPoint(event), "add");
    return;
  }
  if (!state.referencePlacementArmed) return;
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
  state.referencePlacementArmed = false;
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
positionReferenceButton.addEventListener("click", armReferencePlacement);
deleteReferenceButton.addEventListener("click", deleteReference);
saveObjectButton.addEventListener("click", saveObject);
newObjectButton.addEventListener("click", newObject);
deleteObjectButton.addEventListener("click", deleteObject);
objectSize.addEventListener("change", applySelectedObjectStyle);
objectShape.addEventListener("change", applySelectedObjectStyle);
objectColor.addEventListener("input", applySelectedObjectStyle);
applyGlobalObjectStyleButton.addEventListener("click", applyGlobalObjectStyle);
addComplexCoordinateButton.addEventListener("click", addComplexCoordinatePoint);
updateComplexPointButton.addEventListener("click", updateSelectedComplexPoint);
addComplexMapPointButton.addEventListener("click", armComplexMapPoint);
closeComplexObjectButton.addEventListener("click", closeComplexObject);
newComplexObjectButton.addEventListener("click", newComplexObject);
deleteComplexObjectButton.addEventListener("click", deleteComplexObject);
newComplexObjectForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const defaultTitle = nextComplexObjectTitle();
  createComplexObject(newComplexObjectName.value.trim() || defaultTitle);
  newComplexObjectDialog.close();
});
cancelNewComplexObjectButton.addEventListener("click", () => {
  newComplexObjectDialog.close();
});
complexTitle.addEventListener("input", () => {
  const object = state.complexObjects.find(
    (item) => item.id === state.selectedComplexObjectId
  );
  if (!object) return;
  object.title = complexTitle.value.trim() || object.title;
  renderComplexObjects();
  syncComplexObjectsIntoSvg();
  updateMapImage();
  persistDraft();
});
blindMap.addEventListener("change", () => {
  state.blindMap = blindMap.checked;
  syncObjectsIntoSvg();
  renderAll();
  updateMapImage();
  persistDraft();
});
downloadButton.addEventListener("click", downloadSvg);
zoomOutButton.addEventListener("click", () => setZoom(state.zoom / 1.25));
zoomInButton.addEventListener("click", () => setZoom(state.zoom * 1.25));
zoomResetButton.addEventListener("click", () => setZoom(1));

populateShapeSelect(objectShape);
populateShapeSelect(globalObjectShape);
syncDefaultStyleControls();
newObject();
enableEditor(false);
updateZoomDisplay();
renderAll();
