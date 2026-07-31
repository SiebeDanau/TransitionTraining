function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function distance(a, b) {
  if (!a.length) return b.length;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[b.length];
}

function score(feature, query) {
  const title = normalize(feature.title), id = normalize(feature.canonicalId), type = normalize(feature.typeLabel);
  const values = [title, id, normalize(feature.properties.station), normalize(feature.properties.identifier), type].filter(Boolean);
  if (id === query || title === query) return 0;
  if (id.startsWith(query)) return 4;
  if (title.startsWith(query)) return 6;
  if (values.some((value) => value.split(" ").some((word) => word.startsWith(query)))) return 10;
  if (values.some((value) => value.includes(query))) return 16;
  const words = values.flatMap((value) => value.split(" "));
  const tokenScores = query.split(" ").map((token) => {
    if (words.includes(token)) return 0;
    if (words.some((word) => word.startsWith(token))) return .08;
    return Math.min(...words.map((word) => distance(token, word) / Math.max(token.length, word.length)));
  });
  const threshold = query.length < 5 ? .34 : .45;
  return tokenScores.every((tokenScore) => tokenScore <= threshold)
    ? 25 + tokenScores.reduce((total, tokenScore) => total + tokenScore, 0) * 20
    : Infinity;
}

export function createSearchIndex(features) {
  return {
    search(input, limit = 8) {
      const query = normalize(input);
      if (query.length < 2) return [];
      return features.map((feature) => ({ feature, score: score(feature, query) }))
        .filter((result) => Number.isFinite(result.score))
        .sort((a, b) => a.score - b.score || a.feature.title.localeCompare(b.feature.title, "nl"))
        .slice(0, limit).map((result) => result.feature);
    },
  };
}
