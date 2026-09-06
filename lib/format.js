import { format, parseISO, isValid } from 'date-fns'

export const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export const formatIDR = (v) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num(v))

export const formatNumber = (v, digits = 0) =>
  new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits }).format(num(v))

export const formatCompact = (v, withPrefix = true) => {
  const n = num(v)
  const abs = Math.abs(n)
  const p = withPrefix ? 'IDR ' : ''
  const trim = (x) => {
    let s = x.toFixed(x >= 100 ? 0 : x >= 10 ? 1 : 2).replace('.', ',')
    if (s.includes(',')) s = s.replace(/0+$/, '').replace(/,$/, '')
    return s
  }
  if (abs >= 1e12) return `${p}${trim(n / 1e12)} T`
  if (abs >= 1e9) return `${p}${trim(n / 1e9)} M`
  if (abs >= 1e6) return `${p}${trim(n / 1e6)} Jt`
  if (abs >= 1e3) return `${p}${trim(n / 1e3)} Rb`
  return `${p}${formatNumber(n)}`
}

export const formatDate = (iso, fmt = 'dd/MM/yyyy') => {
  if (!iso) return '-'
  try {
    const d = typeof iso === 'string' ? parseISO(iso) : new Date(iso)
    return isValid(d) ? format(d, fmt) : '-'
  } catch (e) {
    return '-'
  }
}

export const formatPct = (v) => `${formatNumber(v, 1)}%`

export const formatBytes = (b) => {
  const n = num(b)
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} B`
}

export const daysUntil = (iso) => {
  if (!iso) return null
  const d = parseISO(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((d - today) / 86400000)
}

export async function api(url, options = {}) {
  const opts = { credentials: 'include', ...options }
  if (opts.body && typeof opts.body !== 'string' && !(opts.body instanceof FormData)) {
    opts.body = JSON.stringify(opts.body)
    opts.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  }
  const res = await fetch(url, opts)
  let data = null
  try {
    data = await res.json()
  } catch (e) {
    data = null
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Request gagal (${res.status})`)
    err.status = res.status
    throw err
  }
  return data
}

export const fetcher = (url) => api(url)

export const WRITE_PERMISSIONS = {
  admin: ['approaches', 'quotations', 'pos', 'schedules', 'basts', 'invoices-in', 'invoices-out', 'stocks', 'projects', 'users'],
  management: [],
  sales: ['approaches', 'quotations', 'pos', 'projects', 'stocks'],
  operations: ['schedules', 'basts', 'projects', 'stocks'],
  finance: ['invoices-in', 'invoices-out', 'projects', 'stocks'],
}

export const canWrite = (user, key) => {
  if (!user) return false
  if (user.role === 'admin') return true
  return (WRITE_PERMISSIONS[user.role] || []).includes(key)
}

export const ROLE_LABEL = {
  admin: 'Admin',
  management: 'Management',
  sales: 'Sales',
  operations: 'Operations',
  finance: 'Finance',
}
