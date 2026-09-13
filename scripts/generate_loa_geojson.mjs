// Published Netherlands AIP ENR 2.1 (11 June 2026). No LoA procedures inferred.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, 'data/airspaces', file), 'utf8'));
const boundary = read('amsterdam-fir.geojson').features[0].geometry.coordinates[0].slice(0, -1);
const point = text => {
  const [lat, lon] = text.split(' ');
  const dms = s => Number(s.slice(0, -5)) + Number(s.slice(-5, -3)) / 60 + Number(s.slice(-3, -1)) / 3600;
  return [dms(lon), dms(lat)];
};
const distance = (a,b) => Math.hypot((a[0]-b[0])*Math.cos((a[1]+b[1])*Math.PI/360), a[1]-b[1]);
function border(a,b) {
  const nearest = p => boundary.reduce((best,v,i) => distance(v,p)<distance(boundary[best],p) ? i : best,0);
  const start = nearest(a), end = nearest(b);
  const walk = step => { const result=[]; for(let i=start; i!==end; i=(i+step+boundary.length)%boundary.length) result.push(boundary[i]); result.push(boundary[end]); return result; };
  const length = points => points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p),0);
  const paths=[walk(1),walk(-1)].sort((a,b)=>length(a)-length(b));
  return [a,...paths[0].slice(1,-1),b];
}
// A 'border' marker expands the next edge along the existing shared FIR boundary.
const definitions = [
  // June amendment: use the replacement East 1 / South 2 boundary coordinates.
  ['EHAME1','Amsterdam CTA East 1','FL 065','FL 195','A','524554N 0045622E;524803N 0051711E;532437N 0063630E;533015N 0064430E;532945N 0064859E;532828N 0065149E;532356N 0065658E;532011N 0065937E;531900N 0070130E;531800N 0071130E;531248N 0071301E;border;530000N 0071234E;525457N 0062952E;524550N 0062000E;522534N 0062000E;520004N 0053116E;515908N 0052009E;520916N 0050608E;520953N 0050254E;521051N 0050000E;521156N 0044334E;524554N 0045622E','Lower limit over Schiphol TMA 1, 3, 4 and 5: FL 095.'],
  ['EHAME2','Amsterdam CTA East 2','FL 095','FL 195','A','522534N 0062000E;521257N 0064350E;521414N 0070347E;border;515002N 0055732E;515622N 0054700E;520004N 0053116E;522534N 0062000E',''],
  ['EHAMS1','Amsterdam CTA South 1','FL 055','FL 195','A','521220N 0043733E;521051N 0050000E;521145N 0050424E;512847N 0043040E;border;511610N 0040651E;512531N 0032419E;515626N 0034502E;515920N 0040640E;521220N 0043733E','Lower limit over Schiphol TMA 1: FL 095.'],
  ['EHAMS2','Amsterdam CTA South 2','FL 095','FL 195','A','520953N 0050254E;520916N 0050608E;515908N 0052009E;515855N 0051742E;515120N 0050158E;512950N 0044824E;border;512847N 0043040E;520953N 0050254E',''],
  ['EHAMW','Amsterdam CTA West','FL 055','FL 195','A','532755N 0033656E;530320N 0034400E;524525N 0042803E;524330N 0043340E;524554N 0045622E;521156N 0044334E;521220N 0043733E;515920N 0040640E;515626N 0034502E;512531N 0032419E;514245N 0021001E;532755N 0033656E','Lower limit over Schiphol TMA 1 and 6: FL 095.'],
  ['EHMCD1','Nieuw Milligen TMA D1','1500 FT AMSL','FL 195','E below FL 065; B above', '521145N 0050424E;520959N 0051355E;520323N 0050940E;515746N 0051517E;515855N 0051742E;520004N 0053116E;515622N 0054700E;515002N 0055732E;border;511446N 0060454E;511455N 0055708E;511100N 0055825E;511100N 0054604E;border;512847N 0043040E;521145N 0050424E', 'Overlaps with Amsterdam CTA East 1 / South 2, Eindhoven TMA 1–4 and Schiphol TMA 3–5 are excluded. Upper limit below Amsterdam CTA South 2: FL 095.'],
  ['EHMCD2','Nieuw Milligen TMA D2','1500 FT AMSL','FL 095','E below FL 065; B above','511100N 0054604E;511100N 0055000E;510941N 0055000E;border;511100N 0054604E','Airspace above is part of Maastricht TMA 2.'],
  ['EHMCG1','Nieuw Milligen TMA G1','1500 FT AMSL','FL 055','E','513544N 0035207E;513745N 0035452E;513654N 0035910E;513800N 0040419E;513800N 0040555E;513648N 0040733E;513701N 0041042E;513600N 0041133E;513600N 0043615E;512847N 0043040E;border;511610N 0040651E;511927N 0035207E;513544N 0035207E',''],
  ['EHMCG2','Nieuw Milligen TMA G2','3500 FT AMSL','FL 055','E','513550N 0031350E;513550N 0033110E;513539N 0033500E;513507N 0033738E;513559N 0034053E;513550N 0034448E;513619N 0034757E;513617N 0035018E;513544N 0035207E;511927N 0035207E;511610N 0040651E;border;512223N 0032147E;512356N 0030600E;513550N 0031350E',''],
  ['EHEH1','Eindhoven TMA 1','1500 FT AMSL','FL 065','C','514106N 0052658E;513530N 0054435E;513324N 0054755E;512345N 0054847E;511958N 0052917E;511608N 0052309E;border;512731N 0050514E;514106N 0052658E',''],
  ['EHEH2','Eindhoven TMA 2','3500 FT AMSL','FL 065','C','514123N 0052605E;514106N 0052658E;512731N 0050514E;513222N 0050723E;513743N 0051233E;514123N 0052605E',''],
  ['EHEH3','Eindhoven TMA 3','3500 FT AMSL','FL 065','C','512345N 0054847E;511741N 0053956E;511612N 0053250E;border;511608N 0052309E;511958N 0052917E;512345N 0054847E',''],
  ['EHEH4','Eindhoven TMA 4','FL 055','FL 065','C','514514N 0052617E;513822N 0054756E;513455N 0055324E;512229N 0055430E;511440N 0054304E;511259N 0053503E;border;511612N 0053250E;511741N 0053956E;512345N 0054847E;513324N 0054755E;513530N 0054435E;514106N 0052658E;514123N 0052605E;513743N 0051233E;513222N 0050723E;512731N 0050514E;border;512831N 0050100E;512826N 0045950E;513345N 0050210E;514029N 0050839E;514514N 0052617E',''],
];
function polygon(lateralLimits) {
  const ring=[]; let followBorder=false;
  for(const token of lateralLimits.split(';')) {
    if(token==='border') { followBorder=true; continue; }
    const p=point(token);
    if(followBorder) ring.push(...border(ring.at(-1),p).slice(1)); else ring.push(p);
    followBorder=false;
  }
  return {type:'Polygon',coordinates:[ring]};
}
const features = definitions.map(([id,name,lowerLimit,upperLimit,airspaceClass,lateralLimits,remarks]) => {
  return {type:'Feature',properties:{id,name,lowerLimit,upperLimit,airspaceClass,loaPartner:'Dutch MIL',parentGroup:name.startsWith('Eindhoven')?'Eindhoven':'Nieuw Milligen',controlUnit:name.startsWith('Eindhoven')?'Eindhoven APP / Dutch MIL outside operational hours':'MILATCC Schiphol / Dutch MIL',remarks,lateralLimits,geometryNote:'Published lateral envelope; vertical overlap exclusions are described in remarks. Border segments reuse the shared Amsterdam FIR boundary.',aipSource:'Netherlands AIP ENR 2.1, AIRAC AMDT 06/2026, effective 11 JUN 2026',aipSourceUrl:'https://eaip.lvnl.nl/web/eaip/AIRAC%20AMDT%2006-2026_2026_06_11/eAIP/EH-ENR%202.1-en-GB.html'},geometry:polygon(lateralLimits)};
});
for(const file of ['maastricht-tma/maastricht-tma-1.geojson','maastricht-tma/maastricht-tma-2.geojson']) {
  for(const feature of read(file).features) {
    feature.properties.loaPartner='Nederland'; feature.properties.parentGroup='Maastricht'; features.push(feature);
  }
}
for (const feature of features.filter(feature => feature.properties.name.startsWith('Amsterdam CTA'))) {
  Object.assign(feature.properties, {
    loaPartner: 'Nederland', parentGroup: 'Amsterdam CTA',
    controlUnit: 'Amsterdam ACC / Amsterdam Radar', hours: 'H24',
  });
}
const output=path.join(root,'data/airspaces/loa');
const specialAreas = read('loa/special-areas-source.json').areas.map(area => ({
  type: 'Feature',
  properties: {
    loaPartner: 'Special areas', parentGroup: area.name.startsWith('SASKI') ? 'SASKI Area' : undefined,
    aipSource: 'Netherlands AIP ENR 2.2 section 8, AIRAC AMDT 06/2026, effective 11 JUN 2026',
    aipSourceUrl: 'https://eaip.lvnl.nl/web/eaip/AIRAC%20AMDT%2006-2026_2026_06_11/eAIP/EH-ENR%202.2-en-GB.html',
    geometryNote: 'Published ATS delegation boundary. National-border segments reuse the shared Amsterdam FIR boundary.',
    ...area,
  },
  geometry: polygon(area.lateralLimits),
}));
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'special-areas.geojson'),JSON.stringify({type:'FeatureCollection',name:'LoA — Special areas',features:specialAreas},null,2)+'\n');
fs.writeFileSync(path.join(output,'netherlands.geojson'),JSON.stringify({type:'FeatureCollection',name:'LoA — Dutch MIL en Nederland',features},null,2)+'\n');
console.log(`Generated ${features.length} LoA airspaces and ${specialAreas.length} special areas.`);
