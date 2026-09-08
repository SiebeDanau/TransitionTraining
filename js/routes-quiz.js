import { loadRepository } from "./shared/data-repository.js";
import { TrainingMap } from "./map/training-map.js";

const el = Object.fromEntries([...document.querySelectorAll('[id]')].map(node => [node.id, node]));
let routes = [], routeIndex = 0, pointIndex = 0, answered = false, mistakes = 0;
let completed = [];
const map = new TrainingMap({ container: el.mapCanvas, noteElement: el.mapNote, showPointInfo: true });
const key = id => String(id).trim().toUpperCase();
const current = () => routes[routeIndex];

function render() {
  const route = current();
  const finished = pointIndex >= route.properties.points.length;
  el.progress.textContent = `Route ${routeIndex + 1} van ${routes.length} · ${Math.min(pointIndex + 1, route.properties.points.length)} / ${route.properties.points.length} punten`;
  el.prompt.textContent = answered ? `${route.title}: fout antwoord` : finished ? `${route.title} voltooid` : `Duid route ${route.title} aan`;

  el.nextRoute.disabled = !(finished || answered) || routeIndex === routes.length - 1;
  el.restart.disabled = false;
  el.score.textContent = `${completed.length} punten voltooid · ${mistakes} foutieve pogingen`;
  el.completed.replaceChildren(...completed.map(id => {
    const item = document.createElement('li'); item.textContent = id; return item;
  }));
}

function startRoute(index) {
  routeIndex = index; pointIndex = 0; answered = false; completed = []; mistakes = 0;
  el.feedback.textContent = ''; el.feedback.dataset.error = 'false';
  el.routeAnswer.hidden = true;
  el.answerPoints.replaceChildren();
  map.clearFeedback(); render();
}

function answer(selected) {
  if (!current() || answered || pointIndex >= current().properties.points.length) return;
  const expected = current().properties.points[pointIndex];
  const selectedPoint = map.points.find(point => point.featureKey === selected);
  const expectedPoint = map.points.find(point => point.featureKey === key(expected));
  const correct = selected === key(expected) || (selectedPoint && expectedPoint &&
    selectedPoint.lon === expectedPoint.lon && selectedPoint.lat === expectedPoint.lat);
  if (!correct) {
    mistakes++;
    answered = true;
    map.revealRoute(current().properties.points.map(key));
    el.routeAnswer.hidden = false;
    el.answerPoints.replaceChildren(...current().properties.points.map(id => {
      const point = map.points.find(point => point.featureKey === key(id));
      const item = document.createElement('li');
      item.textContent = `${id} · ${point?.typeLabel || 'Routepunt'}`;
      return item;
    }));
    el.feedback.textContent = 'Fout antwoord. De volledige correcte route staat op de kaart. Bekijk de punten en ga naar de volgende route.';
    el.feedback.dataset.error = 'true';
  } else {
    completed.push(expected); pointIndex++;
    map.setRouteProgress(completed.map(key));
    el.feedback.textContent = pointIndex === current().properties.points.length ? 'Route voltooid.' : 'Correct. Duid het volgende punt aan.';
    el.feedback.dataset.error = 'false';
  }
  render();
}

el.restart.addEventListener('click', () => startRoute(routeIndex));
el.nextRoute.addEventListener('click', () => { if (routeIndex + 1 < routes.length) startRoute(routeIndex + 1); });
el.backgroundMode.addEventListener('change', () => map.setBackground(el.backgroundMode.value));
map.addEventListener('select', event => answer(event.detail.featureKey));

async function init() {
  try {
    const storedRole = JSON.parse(localStorage.getItem('activeRole') || 'null');
    if (!storedRole) { location.href = 'index.html'; return; }
    const repository = await loadRepository();
    const role = repository.roles.find(role => role.id === storedRole.id);
    if (!role) throw new Error('De geselecteerde rol bestaat niet meer. Kies opnieuw via Modules.');
    el.roleLabel.textContent = `Rol: ${role.label}`;
    const allowed = new Set((role.categories['ats-routes']?.routeIds || []).map(key));
    const roleRoutes = repository.features.filter(f => f.kind === 'route' && allowed.has(f.canonicalId));
    routes = roleRoutes.filter(f => f.geometry && !f.properties.missingPoints.length);
    // Shuffle once so each available route is asked exactly once per session.
    for (let i = routes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [routes[i], routes[j]] = [routes[j], routes[i]];
    }
    const missing = [...allowed].filter(id => !routes.some(r => r.canonicalId === id));
    el.coverage.textContent = missing.length ? `${routes.length} routes beschikbaar. Geen volledige kaartgegevens voor: ${missing.join(', ')}.` : `${routes.length} routes beschikbaar.`;
    if (!routes.length) { el.prompt.textContent = 'Geen routes beschikbaar voor deze rol'; return; }
    // All route points are candidates, including points absent from the role's separate point category.
    const candidates = new Map();
    const pointInfo = new Map();
    [...repository.features].filter(f => f.kind === 'point')
      .sort((a, b) => Number(b.sourceFile.endsWith('-belgium.json')) - Number(a.sourceFile.endsWith('-belgium.json')))
      .forEach(feature => { if (!pointInfo.has(feature.canonicalId)) pointInfo.set(feature.canonicalId, feature); });
    roleRoutes.forEach(route => {
      if (route.properties.missingPoints.length) return;
      const coordinates = route.geometry.coordinates.flat();
      route.properties.points.forEach((id, index) => {
        const [lon, lat] = coordinates[index];
        const feature = pointInfo.get(key(id));
        const colors = { 'significant-point': '#d62728', 'radio-navigation-aid': '#7c3aed', aerodrome: '#087f5b' };
        candidates.set(key(id), {
          featureKey: key(id), label: id, lon, lat,
          color: colors[feature?.subtype] || '#64748b',
          typeLabel: feature?.subtype === 'radio-navigation-aid' ? 'Radio navigation point' : feature?.typeLabel || 'Routepunt',
          info: feature?.properties || {},
        });
      });
    });
    map.initialize([...candidates.values()]);
    startRoute(0);
  } catch (error) {
    el.prompt.textContent = 'Quiz kon niet geladen worden';
    el.feedback.textContent = error.message; el.feedback.dataset.error = 'true';
  }
}
init();
