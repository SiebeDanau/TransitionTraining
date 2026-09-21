// Canvas symbols also work on the quiet basemap, without a glyph service.
export function renderTrafficStream(map, features) {
  const symbols = [];
  function label(text, color) {
    const id = `traffic-label:${color}:${text}`;
    if (!map.hasImage(id)) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.font = '600 24px sans-serif';
      canvas.width = Math.ceil(ctx.measureText(text).width) + 24;
      canvas.height = 44;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = '600 24px sans-serif';
      ctx.fillStyle = color;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 12, 22);
      map.addImage(id, ctx.getImageData(0, 0, canvas.width, canvas.height), { pixelRatio: 2 });
    }
    return id;
  }
  for (const feature of features) {
    const p = feature.properties;
    const coords = feature.geometry.coordinates;
    const end = coords.at(-1), previous = coords.at(-2);
    const rotation = Math.atan2((end[0] - previous[0]) * Math.cos(end[1] * Math.PI / 180), end[1] - previous[1]) * 180 / Math.PI;
    const arrowId = `traffic-arrow:${p.color}`;
    if (!map.hasImage(arrowId)) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 40;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.moveTo(20, 2); ctx.lineTo(36, 36); ctx.lineTo(20, 29); ctx.lineTo(4, 36); ctx.closePath(); ctx.fill();
      map.addImage(arrowId, ctx.getImageData(0, 0, 40, 40), { pixelRatio: 2 });
    }
    function symbol(coordinates, icon, rotate = 0, arrow = false) {
      symbols.push({ type: 'Feature', geometry: { type: 'Point', coordinates }, properties: { icon, rotate, arrow } });
    }
    symbol(end, arrowId, rotation, true);
    symbol([(previous[0] + end[0]) / 2, (previous[1] + end[1]) / 2], label(p.routeLabel, p.color));
    coords.forEach((coordinate, index) => symbol(coordinate, label(p.waypoints[index], '#243247')));
  }
  const data = { type: 'FeatureCollection', features: symbols };
  if (map.getSource('traffic-symbols')) map.getSource('traffic-symbols').setData(data);
  else map.addSource('traffic-symbols', { type: 'geojson', data });
  for (const arrow of [false, true]) {
    const id = arrow ? 'explore-traffic-arrows' : 'explore-traffic-labels';
    if (!map.getLayer(id)) map.addLayer({
      id, type: 'symbol', source: 'traffic-symbols', filter: ['==', ['get', 'arrow'], arrow],
      layout: { 'icon-image': ['get', 'icon'], 'icon-rotate': ['get', 'rotate'],
        'icon-rotation-alignment': arrow ? 'map' : 'viewport',
        'icon-anchor': arrow ? 'top' : 'bottom', 'icon-offset': arrow ? [0, 0] : [0, -10],
        'icon-allow-overlap': arrow, 'icon-ignore-placement': arrow },
    });
  }
}
