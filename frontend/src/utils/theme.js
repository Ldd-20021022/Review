// Dark mode toggle — CSS variable approach
const KEY = 'hr_theme'

export function initTheme() {
  const saved = localStorage.getItem(KEY) || 'light'
  applyTheme(saved)
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light'
  const next = current === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  localStorage.setItem(KEY, next)
  return next
}

export function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light'
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  // Inject CSS variables
  const style = document.getElementById('theme-style') || document.createElement('style')
  style.id = 'theme-style'
  const isDark = theme === 'dark'
  style.textContent = `
    [data-theme="dark"] { color-scheme: dark; }
    [data-theme="dark"] body { background:#0f172a; color:#e2e8f0; }
    [data-theme="dark"] .el-header { background:#1e293b!important; border-color:#334155!important; }
    [data-theme="dark"] .el-main { background:#0f172a!important; }
    [data-theme="dark"] .el-card { background:#1e293b!important; border-color:#334155!important; color:#e2e8f0; }
    [data-theme="dark"] .el-table { background:#1e293b; --el-table-tr-bg:#1e293b; --el-table-row-hover-bg:#334155; }
    [data-theme="dark"] .el-table th.el-table__cell { background:#334155; color:#e2e8f0; }
    [data-theme="dark"] .el-table td.el-table__cell { color:#cbd5e1; }
    [data-theme="dark"] .el-table--striped .el-table__body tr.el-table__row--striped td.el-table__cell { background:#334155; }
    [data-theme="dark"] .el-menu { background:#0f172a!important; }
    [data-theme="dark"] .el-aside { background:#0f172a!important; }
    [data-theme="dark"] .el-input__inner { background:#334155; border-color:#475569; color:#e2e8f0; }
    [data-theme="dark"] .el-button--default { background:#334155; border-color:#475569; color:#e2e8f0; }
    [data-theme="dark"] .el-dialog { background:#1e293b; }
    [data-theme="dark"] .el-tag { border-color:transparent; }
    [data-theme="dark"] input, [data-theme="dark"] textarea { background:#334155!important; color:#e2e8f0!important; }
  `
  if (!style.parentNode) document.head.appendChild(style)
}
