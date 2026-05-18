// SVG charts — zero external libs

export function donutChart(slices, size = 120) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1
  const r = size / 2 - 4; const stroke = 14; const cx = size / 2; const cy = size / 2
  const radius = r - stroke / 2; const circ = 2 * Math.PI * radius
  let offset = 0
  let html = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
  for (const s of slices) {
    const len = (s.value / total) * circ
    html += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${s.color}" stroke-width="${stroke}" stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})" />`
    offset += len
  }
  html += `<text x="${cx}" y="${cy}" text-anchor="middle" dy="0.35em" font-size="${size/6}" font-weight="700" fill="currentColor">${Math.round(slices[0].value / total * 100)}%</text></svg>`
  return html
}

export function barChart(data, width = 300, height = 160) {
  const max = Math.max(...data.map(d => d.value), 1)
  const barH = Math.min(20, (height - 20) / data.length)
  let html = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  data.forEach((d, i) => {
    const w = (d.value / max) * (width - 80); const y = i * (barH + 4) + 4
    html += `<rect x="70" y="${y}" width="${w}" height="${barH}" rx="3" fill="${d.color || '#3b82f6'}" opacity="0.85" />`
    html += `<text x="66" y="${y + barH/2}" text-anchor="end" dy="0.35em" font-size="11" fill="#64748b">${d.label}</text>`
    html += `<text x="${74 + w}" y="${y + barH/2}" dy="0.35em" font-size="10" fill="currentColor">${d.value}</text>`
  })
  html += '</svg>'; return html
}

// ═══════════ Heatmap ═══════════
export function heatmapChart(rows, cols, getValue, width = 500, height = 30) {
  const totalH = rows.length * (height + 2) + 30
  let html = `<svg width="${width}" height="${totalH}" viewBox="0 0 ${width} ${totalH}">`
  const colW = (width - 100) / cols.length
  rows.forEach((row, ri) => {
    const y = ri * (height + 2) + 20
    html += `<text x="96" y="${y + height/2}" text-anchor="end" dy="0.35em" font-size="11" fill="#64748b">${row}</text>`
    cols.forEach((col, ci) => {
      const v = getValue(row, col) || 0
      const x = 100 + ci * colW
      const c = v >= 80 ? '#67c23a' : v >= 60 ? '#e6a23c' : v >= 30 ? '#f97316' : '#ef4444'
      html += `<rect x="${x}" y="${y}" width="${colW - 2}" height="${height}" rx="2" fill="${c}" opacity="0.8"><title>${row} × ${col} = ${v}%</title></rect>`
      html += `<text x="${x + colW/2}" y="${y + height/2}" text-anchor="middle" dy="0.35em" font-size="9" fill="#fff" font-weight="600">${v}%</text>`
    })
  })
  html += '</svg>'; return html
}

// ═══════════ Radar ═══════════
export function radarChart(axes, data, size = 280) {
  const cx = size / 2; const cy = size / 2; const r = size / 2 - 40
  const n = axes.length; const angle = (2 * Math.PI) / n
  let html = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
  // Grid
  for (let level = 1; level <= 4; level++) {
    const rr = r * level / 4; let pts = ''
    for (let i = 0; i < n; i++) {
      const a = angle * i - Math.PI / 2
      pts += `${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)} `
    }
    html += `<polygon points="${pts}" fill="none" stroke="#e2e8f0" stroke-width="1" />`
  }
  // Axes
  for (let i = 0; i < n; i++) {
    const a = angle * i - Math.PI / 2
    html += `<line x1="${cx}" y1="${cy}" x2="${cx + r * Math.cos(a)}" y2="${cy + r * Math.sin(a)}" stroke="#e2e8f0" stroke-width="1" />`
    html += `<text x="${cx + (r + 15) * Math.cos(a)}" y="${cy + (r + 15) * Math.sin(a)}" text-anchor="middle" dy="0.35em" font-size="11" fill="#64748b">${axes[i]}</text>`
  }
  // Data
  let pts = ''
  for (let i = 0; i < n; i++) {
    const a = angle * i - Math.PI / 2; const v = (data[i] || 0) / 100
    pts += `${cx + r * v * Math.cos(a)},${cy + r * v * Math.sin(a)} `
  }
  html += `<polygon points="${pts}" fill="${data.color || '#3b82f6'}" fill-opacity="0.3" stroke="${data.color || '#3b82f6'}" stroke-width="2" />`
  // Dots
  for (let i = 0; i < n; i++) {
    const a = angle * i - Math.PI / 2; const v = (data[i] || 0) / 100
    html += `<circle cx="${cx + r * v * Math.cos(a)}" cy="${cy + r * v * Math.sin(a)}" r="3" fill="${data.color || '#3b82f6'}" />`
  }
  html += '</svg>'; return html
}

// ═══════════ Trend Line ═══════════
export function trendChart(points, width = 400, height = 160, color = '#3b82f6') {
  if (points.length < 2) return ''
  const pad = { t: 10, r: 20, b: 25, l: 40 }
  const w = width - pad.l - pad.r; const h = height - pad.t - pad.b
  const max = Math.max(...points.map(p => p.value), 1); const min = Math.min(...points.map(p => p.value), 0) * 0.9
  const range = max - min || 1
  const stepX = w / (points.length - 1)
  let path = ''; let dots = ''; let labels = ''
  points.forEach((p, i) => {
    const x = pad.l + i * stepX; const y = pad.t + h - ((p.value - min) / range) * h
    path += (i === 0 ? 'M' : 'L') + `${x.toFixed(1)},${y.toFixed(1)} `
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${color}" />`
    if (i % Math.max(1, Math.floor(points.length / 6)) === 0 || i === points.length - 1) {
      labels += `<text x="${x.toFixed(1)}" y="${height - 4}" text-anchor="middle" font-size="10" fill="#94a3b8">${p.label || ''}</text>`
    }
  })
  // Target line at 60
  const targetY = pad.t + h - ((60 - min) / range) * h
  let html = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  html += `<line x1="${pad.l}" y1="${targetY.toFixed(1)}" x2="${pad.l + w}" y2="${targetY.toFixed(1)}" stroke="#ef4444" stroke-dasharray="4,4" stroke-width="1" />`
  html += `<text x="${width - 4}" y="${targetY.toFixed(1) - 2}" text-anchor="end" font-size="9" fill="#ef4444">60</text>`
  // Gradient fill
  html += `<defs><linearGradient id="tg" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="0.2"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>`
  const fillPath = path + `L${pad.l + w},${pad.t + h} L${pad.l},${pad.t + h} Z`
  html += `<path d="${fillPath}" fill="url(#tg)" />`
  html += `<path d="${path.trim()}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" />`
  html += dots + labels + '</svg>'
  return html
}
