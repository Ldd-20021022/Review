// Shared compliance checking — mirrors backend compliance.py
// Eliminates triplicated switch-case in RatingForm.js

function _num(v) {
  return parseFloat(String(v).replace('%', ''))
}

export function checkCompliance(actualValue, standardValue, indicatorType) {
  const actual = _num(actualValue)
  const standard = _num(standardValue)
  if (isNaN(actual) || isNaN(standard)) return null

  switch (indicatorType) {
    case 'numeric_less_equal':
      return actual <= standard
    case 'numeric_greater_equal':
      return actual >= standard
    case 'numeric_equal':
      return actual === standard
    case 'numeric_range': {
      const parts = String(standardValue).replace('%', '').split('-')
      const lo = _num(parts[0]), hi = _num(parts[1])
      if (isNaN(lo) || isNaN(hi)) return null
      return actual >= lo && actual <= hi
    }
    case 'yesno':
      return ['是', '1', 'yes', 'true'].includes(String(actualValue).toLowerCase())
    default:
      return null
  }
}

export function calcScore(actualValue, standardValue, indicatorType) {
  const actual = _num(actualValue)
  const standard = _num(standardValue)
  if (isNaN(actual) || isNaN(standard)) return 0

  switch (indicatorType) {
    case 'numeric_less_equal':
      return actual <= standard ? 100 : Math.max(0, 100 - (actual - standard) * 50)
    case 'numeric_greater_equal':
      return actual >= standard ? 100 : Math.max(0, 100 - (standard - actual) * 50)
    case 'numeric_equal':
      return actual === standard ? 100 : 0
    case 'numeric_range': {
      const parts = String(standardValue).replace('%', '').split('-')
      const lo = _num(parts[0]), hi = _num(parts[1])
      if (isNaN(lo) || isNaN(hi)) return 0
      if (actual >= lo && actual <= hi) return 100
      return Math.max(0, 100 - Math.min(Math.abs(actual - lo), Math.abs(actual - hi)) * 50)
    }
    case 'yesno':
      return ['是', '1', 'yes', 'true'].includes(String(actualValue).toLowerCase()) ? 100 : 0
    default:
      return 100
  }
}
