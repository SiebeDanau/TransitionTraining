import { createMapPdf } from './map-pdf.js';

export function addMapPdfControl(map) {
  map.addControl({
    onAdd() {
      this.container = document.createElement('div');
      this.container.className = 'maplibregl-ctrl map-pdf-control';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Opslaan als PDF';
      button.title = 'Bewaar de huidige kaart als liggende A4-PDF op 300 dpi';
      Object.assign(button.style, { background: 'white', color: '#186c78', border: '1px solid #d8d5cc', borderRadius: '6px', padding: '10px 12px', font: '14px Arial, sans-serif', cursor: 'pointer' });
      const status = document.createElement('div');
      status.setAttribute('role', 'status');
      Object.assign(status.style, { background: 'white', maxWidth: '260px', font: '13px Arial, sans-serif' });
      button.addEventListener('click', async () => {
        button.disabled = true;
        button.textContent = 'PDF voorbereiden…';
        status.textContent = '';
        try {
          await saveMapPdf(map);
          status.textContent = 'PDF gedownload.';
        } catch (error) {
          status.textContent = `PDF kon niet worden opgeslagen. ${error.message}`;
        } finally {
          button.disabled = false;
          button.textContent = 'Opslaan als PDF';
        }
      });
      this.container.append(button, status);
      return this.container;
    },
    onRemove() { this.container.remove(); },
  }, 'top-left');
}

async function saveMapPdf(map) {
  const { clientWidth: width, clientHeight: height } = map.getContainer();
  if (!width || !height || !map.isStyleLoaded()) throw new Error('Wacht tot de kaart geladen is en probeer opnieuw.');
  // 10 mm margins; reserve 6 mm for source attribution.
  const scale = Math.min(277 / width, 184 / height);
  const pixelRatio = scale * 300 / 25.4;
  const host = document.createElement('div');
  Object.assign(host.style, { position: 'fixed', left: '-100000px', top: '0', width: `${width}px`, height: `${height}px`, pointerEvents: 'none' });
  document.body.append(host);
  let renderMap;
  try {
    const style = structuredClone(map.getStyle());
    style.layers = style.layers.filter(layer => layer.id !== 'training-hover-preview');
    renderMap = new window.maplibregl.Map({
      container: host, style, center: map.getCenter(), zoom: map.getZoom(),
      bearing: map.getBearing(), pitch: map.getPitch(), padding: map.getPadding(),
      renderWorldCopies: map.getRenderWorldCopies(), interactive: false,
      attributionControl: false, pixelRatio,
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true }, fadeDuration: 0,
    });
    await new Promise((resolve, reject) => {
      const finish = error => {
        clearTimeout(timeout);
        renderMap.off('idle', onIdle);
        renderMap.off('error', onError);
        error ? reject(error) : resolve();
      };
      const onIdle = () => finish();
      const onError = event => finish(event.error || new Error('Kaartgegevens konden niet worden geladen.'));
      const timeout = setTimeout(() => finish(new Error('Controleer je internetverbinding en probeer opnieuw.')), 45000);
      renderMap.once('idle', onIdle);
      renderMap.on('error', onError);
    });
    const canvas = renderMap.getCanvas();
    if (canvas.width < width * pixelRatio - 2 || canvas.height < height * pixelRatio - 2) throw new Error('Deze browser kan de kaart niet op 300 dpi renderen. Probeer een kleiner browservenster.');
    const attributions = new Set(Object.values(style.sources).map(source => source.attribution).filter(Boolean));
    Object.keys(style.sources).forEach(id => {
      const text = renderMap.getSource(id)?.attribution;
      if (text) attributions.add(text);
    });
    const attribution = [...attributions].map(html => {
      const template = document.createElement('template');
      template.innerHTML = html;
      template.content.querySelectorAll('script, style').forEach(node => node.remove());
      return template.content.textContent.replace(/\s+/g, ' ').trim();
    }).join(' · ');
    const pdf = await createMapPdf(canvas, width * scale, height * scale, attribution);
    const url = URL.createObjectURL(pdf);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'trainingskaart-a4.pdf';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } finally {
    renderMap?.remove();
    host.remove();
  }
}
