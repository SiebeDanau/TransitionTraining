import { QuizEngine } from "./quiz/quiz-engine.js";
import { standardQuestionTypes } from "./quiz/question-types.js";
import { TrainingMap } from "./map/training-map.js";

const elements = {
  backgroundMode: document.querySelector("#backgroundMode"),
  mapCanvas: document.querySelector("#mapCanvas"),
  mapNote: document.querySelector("#mapNote"),
  prompt: document.querySelector("#prompt"),
  feedback: document.querySelector("#feedback"),
  correctCount: document.querySelector("#correctCount"),
  wrongCount: document.querySelector("#wrongCount"),
  streakCount: document.querySelector("#streakCount"),
  progressCount: document.querySelector("#progressCount"),
  nextButton: document.querySelector("#nextButton"),
  revealButton: document.querySelector("#revealButton"),
  resetButton: document.querySelector("#resetButton"),
  retryButton: document.querySelector("#retryButton"),
};

let moduleConfig = readStoredJson("activeModule");
const activeRole = readStoredJson("activeRole");
const backgroundMode = localStorage.getItem("mapBackgroundMode") || "osm";
const engine = new QuizEngine(standardQuestionTypes);
const trainingMap = new TrainingMap({
  container: elements.mapCanvas,
  noteElement: elements.mapNote,
  backgroundMode,
});
let questions = [];

elements.backgroundMode.value = backgroundMode;
setTitle();
bindApplicationEvents();
initialize();

function readStoredJson(key) {
  try { return JSON.parse(localStorage.getItem(key)); }
  catch { return null; }
}

function setTitle() {
  if (!moduleConfig) return;
  document.title = moduleConfig.title;
  document.querySelector("#pageTitle").textContent = moduleConfig.title;
  if (activeRole) document.querySelector("#pageIntro").textContent = `Rol: ${activeRole.label}`;
}

function normalizePointId(value) {
  return String(value || "").trim().toUpperCase();
}

function parseCoordinate(value) {
  if (typeof value === "number") return value;
  const match = String(value || "").trim().toUpperCase()
    .match(/^(\d{2,3})(\d{2})(\d{2}(?:\.\d+)?)([NSEW])$/);
  if (!match) return Number.NaN;
  const sign = match[4] === "S" || match[4] === "W" ? -1 : 1;
  return sign * (Number(match[1]) + Number(match[2]) / 60 + Number(match[3]) / 3600);
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} kon niet geladen worden (${response.status}).`);
  return response.json();
}

async function initialize() {
  if (!moduleConfig || moduleConfig.type !== "map" || !activeRole) {
    window.location.href = "index.html";
    return;
  }

  try {
    const [config, roleConfig] = await Promise.all([
      fetchJson("data/config.json"),
      fetchJson("data/roles.json"),
    ]);
    moduleConfig = config.modules?.find((item) => item.id === moduleConfig.id);
    if (!moduleConfig) throw new Error("Deze module bestaat niet meer.");
    localStorage.setItem("activeModule", JSON.stringify(moduleConfig));
    setTitle();

    const collections = await Promise.all(
      (moduleConfig.data || []).map((file) => fetchJson(`data/${file}`)),
    );
    const role = roleConfig.roles?.find((item) => item.id === activeRole.id);
    const allowedIds = new Set(
      (role?.categories?.[moduleConfig.id]?.pointIds || []).map(normalizePointId),
    );
    questions = createMapQuestions(
      collections.flatMap((collection) => collection.points || []),
      allowedIds,
    );
    reportMissingRoleData(allowedIds, questions);
    trainingMap.initialize(questions);

    if (!questions.length) {
      elements.prompt.textContent = "Geen punten gevonden";
      setFeedback(`Voor ${activeRole.label} zijn geen punten uit de categorie ${moduleConfig.id} gevonden.`, "bad");
      setControlsEnabled(false);
      return;
    }
    startRound(questions);
  } catch (error) {
    elements.prompt.textContent = "Module kon niet geladen worden";
    setFeedback(error.message, "bad");
    setControlsEnabled(false);
  }
}

function createMapQuestions(records, allowedIds) {
  const unique = new Map();
  records.forEach((record) => {
    const featureKey = normalizePointId(record.id || record.name || record.title);
    const lat = parseCoordinate(record.lat);
    const lon = parseCoordinate(record.lon);
    if (!featureKey || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const label = record.name || featureKey;
    unique.set(featureKey, {
      id: `${moduleConfig.id}:${featureKey}`,
      questionType: "map-location",
      prompt: label,
      label,
      featureKey,
      correctFeatureKey: featureKey,
      acceptedFeatureKeys: [featureKey],
      lat,
      lon,
    });
  });

  const questionsByLocation = new Map();
  unique.forEach((question) => {
    const locationKey = `${question.lat.toFixed(7)},${question.lon.toFixed(7)}`;
    const locationQuestions = questionsByLocation.get(locationKey) || [];
    locationQuestions.push(question);
    questionsByLocation.set(locationKey, locationQuestions);
  });
  questionsByLocation.forEach((locationQuestions) => {
    const acceptedFeatureKeys = locationQuestions.map((question) => question.featureKey);
    locationQuestions.forEach((question) => {
      question.acceptedFeatureKeys = acceptedFeatureKeys;
    });
  });

  return [...unique.values()]
    .filter((question) => !allowedIds.size || allowedIds.has(question.featureKey))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function reportMissingRoleData(allowedIds, availableQuestions) {
  const availableIds = new Set(availableQuestions.map((question) => question.featureKey));
  const missing = [...allowedIds].filter((id) => !availableIds.has(id));
  if (missing.length) {
    console.warn(`[${moduleConfig.id}] ${missing.length} punten voor rol "${activeRole.label}" zijn niet gevonden:`, missing);
  }
}

function bindApplicationEvents() {
  trainingMap.addEventListener("select", ({ detail }) => engine.answer(detail));
  engine.addEventListener("question", ({ detail }) => showQuestion(detail));
  engine.addEventListener("answer", ({ detail }) => showAnswer(detail));
  engine.addEventListener("complete", ({ detail }) => finishRound(detail));
  engine.addEventListener("reset", ({ detail }) => updateStats(detail));

  elements.nextButton.addEventListener("click", () => {
    if (!engine.snapshot().answered) {
      window.alert("Duid eerst een punt aan");
      return;
    }
    engine.next();
  });
  elements.revealButton.addEventListener("click", () => engine.reveal());
  elements.resetButton.addEventListener("click", () => startRound(questions));
  elements.retryButton.addEventListener("click", () => {
    engine.retryIncorrect();
    prepareRound();
    engine.next();
  });
  elements.backgroundMode.addEventListener("change", () => {
    localStorage.setItem("mapBackgroundMode", elements.backgroundMode.value);
    trainingMap.setBackground(elements.backgroundMode.value);
  });
}

function startRound(roundQuestions) {
  engine.reset(roundQuestions);
  prepareRound();
  engine.next();
}

function prepareRound() {
  trainingMap.clearFeedback();
  elements.nextButton.disabled = false;
  elements.revealButton.disabled = false;
  elements.resetButton.disabled = false;
  elements.retryButton.style.display = "none";
  setFeedback("");
}

function showQuestion(snapshot) {
  elements.prompt.textContent = snapshot.current.prompt;
  trainingMap.clearFeedback();
  setFeedback("");
  updateStats(snapshot);
}

function showAnswer(snapshot) {
  const { result } = snapshot;
  trainingMap.showAnswer({
    selectedFeatureKey: result.answer?.featureKey,
    correctFeatureKey: result.question.correctFeatureKey,
    correct: result.correct,
    revealed: result.revealed,
  });
  if (result.revealed) {
    setFeedback(`Dit is ${result.question.label}.`, "bad");
  } else if (result.correct) {
    setFeedback("Juist.", "good");
  } else {
    const selected = questions.find((question) => question.featureKey === result.answer?.featureKey);
    setFeedback(`Fout. Je duidde ${selected?.label || "een ander punt"} aan.`, "bad");
  }
  updateStats(snapshot);
}

function finishRound(snapshot) {
  elements.prompt.textContent = "Ronde klaar";
  setFeedback(`Je had ${snapshot.correct} juist en ${snapshot.wrong} fout.`, "good");
  trainingMap.clearFeedback();
  elements.nextButton.disabled = true;
  elements.revealButton.disabled = true;
  elements.retryButton.style.display = snapshot.incorrectQuestions.length ? "" : "none";
  updateStats(snapshot);
}

function updateStats(snapshot = engine.snapshot()) {
  elements.correctCount.textContent = String(snapshot.correct);
  elements.wrongCount.textContent = String(snapshot.wrong);
  elements.streakCount.textContent = String(snapshot.streak);
  elements.progressCount.textContent = `${snapshot.correct + snapshot.wrong} / ${snapshot.total}`;
}

function setFeedback(text, type = "") {
  elements.feedback.textContent = text;
  elements.feedback.className = type ? `feedback ${type}` : "feedback";
}

function setControlsEnabled(enabled) {
  elements.nextButton.disabled = !enabled;
  elements.revealButton.disabled = !enabled;
  elements.resetButton.disabled = !enabled;
}
