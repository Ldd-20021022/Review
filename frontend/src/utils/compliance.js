// Client-side compliance checking — mirrors backend compliance.py + gap_analysis.py
// Used by RatingForm for real-time preview before submission

const _unitChars = new Set('张个起元例人次名次床比例率‰天日月年小时厘米毫升升毫摩尔分秒点钟件种项科处所级类组等甲乙丙丁')
const _unitMultipliers = { '万': 10000, '亿': 100000000, '千': 1000 }

function _extractNumber(v) {
  v = String(v)
  let multiplier = 1

  // Unit multiplier (万/亿/千)
  for (const [unit, mult] of Object.entries(_unitMultipliers)) {
    if (v.includes(unit)) {
      multiplier = mult
      v = v.replace(unit, '')
      break
    }
  }

  // Remove comparison operators
  v = v.replace(/[≤≥<=>=]/g, '')
  v = v.replace(/[=>< ]/g, '')

  // Ratio handling: "1:1.5" → second/first = 1.5/1.0 = 1.5
  if (v.includes(':')) {
    const parts = v.split(':')
    const first = parts[0].split('').filter(c => !_unitChars.has(c)).join('')
    const second = parts[1].split('').filter(c => !_unitChars.has(c)).join('')
    const f = parseFloat(first), s = parseFloat(second)
    if (!isNaN(f) && !isNaN(s) && f !== 0) {
      v = String(s / f)
    } else {
      v = first
    }
  }

  // Remove % and ‰
  v = v.replace(/[%‰]/g, '')

  // Remove unit chars
  v = v.split('').filter(c => !_unitChars.has(c)).join('')

  // Clean trailing separators
  v = v.replace(/[/\-\.]+$/, '').trim()

  if (!v || v === '-') return NaN

  return parseFloat(v) * multiplier
}

export function checkCompliance(actualValue, standardValue, indicatorType) {
  if (indicatorType === 'yesno') {
    return ['是', '1', 'yes', 'true'].includes(String(actualValue).toLowerCase())
  }

  const actual = _extractNumber(actualValue)
  const standard = _extractNumber(standardValue)
  if (isNaN(actual) || isNaN(standard)) return null

  switch (indicatorType) {
    case 'numeric_less_equal':
      return actual <= standard
    case 'numeric_greater_equal':
      return actual >= standard
    case 'numeric_equal':
      // 2% tolerance matching backend
      if (actual === standard) return true
      if (standard > 0 && Math.abs(actual - standard) / standard <= 0.02) return true
      return false
    case 'numeric_range': {
      const parts = String(standardValue).replace(/[%‰]/g, '').split('-')
      const lo = parseFloat(parts[0]), hi = parseFloat(parts[1])
      if (isNaN(lo) || isNaN(hi)) return null
      return actual >= lo && actual <= hi
    }
    default:
      return true
  }
}

export function calcScore(actualValue, standardValue, indicatorType) {
  if (indicatorType === 'yesno') {
    return ['是', '1', 'yes', 'true'].includes(String(actualValue).toLowerCase()) ? 100 : 0
  }

  const actual = _extractNumber(actualValue)
  const standard = _extractNumber(standardValue)
  if (isNaN(actual) || isNaN(standard)) return 0

  switch (indicatorType) {
    case 'numeric_less_equal':
      if (actual <= standard) return 100
      if (standard > 0) {
        const deviation = (actual - standard) / standard
        return Math.max(0, Math.floor(100 - deviation * 100))
      }
      return Math.max(0, Math.floor(100 - Math.abs(actual - standard) * 100))

    case 'numeric_greater_equal':
      if (actual >= standard) return 100
      if (standard > 0) {
        const deviation = (standard - actual) / standard
        return Math.max(0, Math.floor(100 - deviation * 100))
      }
      return Math.max(0, Math.floor(100 - Math.abs(standard - actual) * 100))

    case 'numeric_equal':
      if (actual === standard) return 100
      if (standard > 0 && Math.abs(actual - standard) / standard <= 0.02) return 95
      return 0

    case 'numeric_range': {
      const parts = String(standardValue).replace(/[%‰]/g, '').split('-')
      const lo = parseFloat(parts[0]), hi = parseFloat(parts[1])
      if (isNaN(lo) || isNaN(hi)) return 0
      if (actual >= lo && actual <= hi) return 100
      const dist = Math.min(Math.abs(actual - lo), Math.abs(actual - hi))
      if (lo > 0) return Math.max(0, Math.floor(100 - (dist / lo) * 100))
      return Math.max(0, Math.floor(100 - dist * 100))
    }

    default:
      return 100
  }
}

// For external debugging / testing
export { _extractNumber }
