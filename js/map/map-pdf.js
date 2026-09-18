// Lossless raster PDF export using the browser's built-in deflate compressor.
export async function createMapPdf(canvas, widthMm, heightMm, attribution = "") {
  const image = document.createElement("canvas");
  image.width = canvas.width;
  image.height = canvas.height;
  const context = image.getContext("2d");
  context.fillStyle = "white";
  context.fillRect(0, 0, image.width, image.height);
  context.drawImage(canvas, 0, 0);
  const rgba = context.getImageData(0, 0, image.width, image.height).data;
  const rgb = new Uint8Array(image.width * image.height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4) {
    rgb[j++] = rgba[i]; rgb[j++] = rgba[i + 1]; rgb[j++] = rgba[i + 2];
  }
  const compressed = new Uint8Array(await new Response(
    new Blob([rgb]).stream().pipeThrough(new CompressionStream("deflate")),
  ).arrayBuffer());
  return buildMapPdf(compressed, image.width, image.height, widthMm, heightMm, attribution);
}

export function buildMapPdf(rgbDeflate, pixelsWide, pixelsHigh, widthMm, heightMm, attribution = "") {
  const encoder = new TextEncoder();
  const chunks = [];
  const offsets = [0];
  let length = 0;
  const append = value => {
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id, body) => {
    offsets[id] = length;
    append(`${id} 0 obj\n${body}\nendobj\n`);
  };
  const stream = (id, dict, data) => {
    offsets[id] = length;
    append(`${id} 0 obj\n<< ${dict} /Length ${data.length} >>\nstream\n`);
    append(data);
    append("\nendstream\nendobj\n");
  };
  const pt = mm => mm * 72 / 25.4;
  const w = pt(widthMm), h = pt(heightMm);
  const x = (pt(297) - w) / 2, y = pt(16) + (pt(184) - h) / 2;
  // Standard Helvetica uses WinAnsi. Hex strings keep text out of PDF syntax.
  const hex = text => Array.from(text, char => {
    const code = char.codePointAt(0);
    return (code <= 255 ? code : 63).toString(16).padStart(2, "0");
  }).join("");
  const lines = attribution.match(/.{1,150}(?:\s|$)|.{1,150}/g) || [];
  const footer = lines.slice(0, 3).map((line, i) =>
    `BT /F1 6 Tf 1 0 0 1 ${pt(10).toFixed(3)} ${(pt(12) - i * 7).toFixed(3)} Tm <${hex(line.trim())}> Tj ET`,
  ).join("\n");
  append("%PDF-1.4\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pt(297).toFixed(3)} ${pt(210).toFixed(3)}] /Resources << /XObject << /Map 4 0 R >> /Font << /F1 6 0 R >> >> /Contents 5 0 R >>`);
  stream(4, `/Type /XObject /Subtype /Image /Width ${pixelsWide} /Height ${pixelsHigh} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode`, rgbDeflate);
  stream(5, "", encoder.encode(`q ${w.toFixed(3)} 0 0 ${h.toFixed(3)} ${x.toFixed(3)} ${y.toFixed(3)} cm /Map Do Q\n${footer}\n`));
  object(6, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const xref = length;
  append("xref\n0 7\n0000000000 65535 f \n");
  for (let id = 1; id <= 6; id++) append(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  append(`trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: "application/pdf" });
}
