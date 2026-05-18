// SVG charts — no external libs needed

export function donutChart(slices, size = 120) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1
  const r = size / 2 - 4
  const stroke = 14
  const cx = size / 2; const cy = size / 2
  const radius = r - stroke / 2
  const circ = 2 * Math.PI * radius
  let offset = 0
  let html = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
  for (const s of slices) {
    const len = (s.value / total) * circ
    html += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${s.color}" stroke-width="${stroke}" stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})" />`
    offset += len
  }
  html += `<text x="${cx}" y="${cy}" text-anchor="middle" dy="0.35em" font-size="${size/6}" font-weight="700" fill="#1e293b">${Math.round(slices[0].value / total * 100)}%</text>`
  html += '</svg>'
  return html
}

export function barChart(data, width = 300, height = 160) {
  const max = Math.max(...data.map(d => d.value), 1)
  const barH = Math.min(20, (height - 20) / data.length)
  let html = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  data.forEach((d, i) => {
    const w = (d.value / max) * (width - 80)
    const y = i * (barH + 4) + 4
    html += `<rect x="70" y="${y}" width="${w}" height="${barH}" rx="3" fill="${d.color || '#3b82f6'}" opacity="0.85" />`
    html += `<text x="66" y="${y + barH/2}" text-anchor="end" dy="0.35em" font-size="11" fill="#64748b">${d.label}</text>`
    html += `<text x="${74 + w}" y="${y + barH/2}" dy="0.35em" font-size="10" fill="#1e293b">${d.value}</text>`
  })
  html += '</svg>'
  return html
}
