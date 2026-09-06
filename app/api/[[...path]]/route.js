import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// DB
// ---------------------------------------------------------------------------
let client
let db
let seeded = false
let connecting = null

async function connectToMongo() {
  if (!db) {
    if (!connecting) {
      connecting = (async () => {
        const c = new MongoClient(process.env.MONGO_URL)
        await c.connect()
        client = c
        db = c.db(process.env.DB_NAME)
        return db
      })()
    }
    await connecting
  }
  if (!seeded) {
    const count = await db.collection('users').countDocuments()
    if (count === 0) await seedDatabase(db)
    seeded = true
  }
  return db
}

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads')
function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const COLLECTIONS = {
  approaches: 'approaches',
  quotations: 'quotations',
  pos: 'pos',
  schedules: 'schedules',
  basts: 'basts',
  'invoices-in': 'invoices_in',
  'invoices-out': 'invoices_out',
  stocks: 'stocks',
  projects: 'projects',
  users: 'users',
}

const STAGE_ORDER = ['Approach', 'Penawaran', 'PO', 'Schedule', 'BAST', 'Invoice In', 'Invoice Out', 'Closed']

const WRITE_PERMISSIONS = {
  admin: Object.keys(COLLECTIONS),
  management: [],
  sales: ['approaches', 'quotations', 'pos', 'projects', 'stocks'],
  operations: ['schedules', 'basts', 'projects', 'stocks'],
  finance: ['invoices-in', 'invoices-out', 'projects', 'stocks'],
}

const DEFAULT_SETTINGS = {
  id: 'global',
  revenueBasis: 'invoice_out', // invoice_out | po_value | completed_project
  businessLines: ['Trading', 'Logistics'],
  units: ['MT', 'kg', 'liter', 'unit', 'trip', 'container', 'CBM', 'other'],
  documentCategories: ['Quotation', 'PO', 'Surat Jalan', 'POD', 'BAST', 'Invoice', 'Foto', 'Lainnya'],
  projectStatuses: ['Belum Jalan', 'Ongoing', 'Partial', 'Finish', 'Cancelled'],
  notificationRules: {
    quotationNoAttachment: true,
    poNoSchedule: true,
    scheduleOverdue: true,
    bastMissing: true,
    invoiceDueDays: 7,
    projectStaleDays: 14,
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function cors(response) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}
const json = (data, status = 200) => cors(NextResponse.json(data, { status }))
const error = (message, status = 400) => json({ error: message }, status)
const clean = (doc) => {
  if (!doc) return doc
  const { _id, ...rest } = doc
  return rest
}
const num = (v) => {
  if (v === null || v === undefined || v === '') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const todayISO = () => new Date().toISOString().slice(0, 10)
const addDays = (days, base = new Date()) => {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
const monthKey = (iso) => (iso ? String(iso).slice(0, 7) : null)

function hashPassword(password, salt = crypto.randomBytes(8).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 32).toString('hex')
  return `${salt}:${hash}`
}
function verifyPassword(password, stored) {
  if (!stored) return false
  const [salt, hash] = stored.split(':')
  const test = crypto.scryptSync(password, salt, 32).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'))
}

function getCookie(request, name) {
  const cookie = request.headers.get('cookie') || ''
  const match = cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(name + '='))
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null
}

async function getUser(request, db) {
  let token = getCookie(request, 'across_session')
  const auth = request.headers.get('authorization')
  if (!token && auth && auth.startsWith('Bearer ')) token = auth.slice(7)
  if (!token) return null
  const session = await db.collection('sessions').findOne({ token })
  if (!session) return null
  const user = await db.collection('users').findOne({ id: session.userId })
  if (!user) return null
  const { password, _id, ...safe } = user
  return safe
}

function canWrite(user, key) {
  if (!user) return false
  if (user.role === 'admin') return true
  return (WRITE_PERMISSIONS[user.role] || []).includes(key)
}

async function getSettings(db) {
  const s = await db.collection('settings').findOne({ id: 'global' })
  if (!s) {
    await db.collection('settings').insertOne({ ...DEFAULT_SETTINGS })
    return { ...DEFAULT_SETTINGS }
  }
  return { ...DEFAULT_SETTINGS, ...clean(s), notificationRules: { ...DEFAULT_SETTINGS.notificationRules, ...(s.notificationRules || {}) } }
}

async function nextProjectId(db) {
  const year = new Date().getFullYear()
  const prefix = `PRJ-${year}-`
  const count = await db.collection('projects').countDocuments({ projectId: { $regex: `^${prefix}` } })
  return `${prefix}${String(count + 1).padStart(4, '0')}`
}

// ---------------------------------------------------------------------------
// Normalization per collection (auto-calculations)
// ---------------------------------------------------------------------------
function normalizeRecord(key, body) {
  const rec = { ...body }
  if (key === 'quotations') {
    rec.revenue = num(rec.revenue)
    rec.hpp = num(rec.hpp)
    rec.margin = rec.revenue - rec.hpp
    rec.marginPct = rec.revenue > 0 ? Math.round((rec.margin / rec.revenue) * 10000) / 100 : 0
  }
  if (key === 'pos') {
    rec.poValue = num(rec.poValue)
    rec.quantity = num(rec.quantity)
  }
  if (key === 'schedules' || key === 'basts') {
    rec.qty = num(rec.qty)
  }
  if (key === 'invoices-in' || key === 'invoices-out') {
    rec.amount = num(rec.amount)
    rec.paidAmount = num(rec.paidAmount)
    rec.outstanding = Math.max(0, rec.amount - rec.paidAmount)
    const today = todayISO()
    if (rec.outstanding === 0 && rec.amount > 0) rec.status = 'Paid'
    else if (rec.paidAmount > 0 && rec.outstanding > 0 && rec.status !== 'Overdue') rec.status = 'Partial Paid'
    if (rec.outstanding > 0 && rec.dueDate && rec.dueDate < today && rec.status !== 'Draft') rec.status = 'Overdue'
  }
  if (key === 'stocks') {
    rec.currentStock = num(rec.currentStock)
    rec.stockValue = num(rec.stockValue)
    rec.lastUpdated = rec.lastUpdated || todayISO()
  }
  if (key === 'projects') {
    rec.revenue = num(rec.revenue)
    rec.hpp = num(rec.hpp)
  }
  return rec
}

// ---------------------------------------------------------------------------
// Project rollup – derives header numbers from stage records
// ---------------------------------------------------------------------------
async function recomputeProject(db, projectId) {
  if (!projectId) return null
  const project = await db.collection('projects').findOne({ id: projectId })
  if (!project) return null

  const [quotations, pos, schedules, basts, invIn, invOut, docCount, approaches] = await Promise.all([
    db.collection('quotations').find({ projectId }).toArray(),
    db.collection('pos').find({ projectId }).toArray(),
    db.collection('schedules').find({ projectId }).toArray(),
    db.collection('basts').find({ projectId }).toArray(),
    db.collection('invoices_in').find({ projectId }).toArray(),
    db.collection('invoices_out').find({ projectId }).toArray(),
    db.collection('documents').countDocuments({ projectId }),
    db.collection('approaches').find({ projectId }).toArray(),
  ])

  const approved = quotations.find((q) => q.status === 'Approved')
  const latestQ = approved || quotations.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0]
  const activePos = pos.filter((p) => p.status !== 'Cancelled')

  let revenue = latestQ ? num(latestQ.revenue) : 0
  let hpp = latestQ ? num(latestQ.hpp) : 0
  if (!latestQ && activePos.length) revenue = activePos.reduce((s, p) => s + num(p.poValue), 0)
  if (project.manualRevenue) revenue = num(project.revenue)
  if (project.manualRevenue) hpp = num(project.hpp)

  const poQty = activePos.reduce((s, p) => s + num(p.quantity), 0)
  const poValue = activePos.reduce((s, p) => s + num(p.poValue), 0)
  const unit = activePos[0]?.unit || latestQ?.unit || project.unit || ''
  const deliveredQty = schedules.filter((s) => s.status === 'Delivered').reduce((s, r) => s + num(r.qty), 0)
  const scheduledQty = schedules.filter((s) => s.status !== 'Cancelled').reduce((s, r) => s + num(r.qty), 0)
  const bastQty = basts.reduce((s, b) => s + num(b.qty), 0)
  const invoicedOut = invOut.reduce((s, i) => s + num(i.amount), 0)
  const piutang = invOut.reduce((s, i) => s + num(i.outstanding), 0)
  const utang = invIn.reduce((s, i) => s + num(i.outstanding), 0)

  // current stage
  let stageIdx = 0
  if (approaches.length) stageIdx = 0
  if (quotations.length) stageIdx = 1
  if (activePos.length) stageIdx = 2
  if (schedules.length) stageIdx = 3
  if (basts.length) stageIdx = 4
  if (invIn.length) stageIdx = Math.max(stageIdx, 5)
  if (invOut.length) stageIdx = Math.max(stageIdx, 6)
  const allOutPaid = invOut.length > 0 && invOut.every((i) => i.status === 'Paid')
  const allInPaid = invIn.length === 0 || invIn.every((i) => i.status === 'Paid')
  if (allOutPaid && allInPaid && poQty > 0 && deliveredQty >= poQty) stageIdx = 7

  // status
  let status
  if (project.statusOverride) status = project.statusOverride
  else if (activePos.length === 0 && pos.length > 0) status = 'Cancelled'
  else if (activePos.length === 0) status = 'Belum Jalan'
  else if (poQty > 0 && deliveredQty >= poQty) status = 'Finish'
  else if (deliveredQty > 0) status = 'Partial'
  else status = 'Ongoing'

  const margin = revenue - hpp
  const update = {
    revenue,
    hpp,
    margin,
    marginPct: revenue > 0 ? Math.round((margin / revenue) * 10000) / 100 : 0,
    poQty,
    poValue,
    unit,
    deliveredQty,
    scheduledQty,
    remainingQty: Math.max(0, poQty - deliveredQty),
    completionPct: poQty > 0 ? Math.min(100, Math.round((deliveredQty / poQty) * 100)) : 0,
    bastQty,
    invoicedOut,
    piutang,
    utang,
    currentStage: STAGE_ORDER[stageIdx],
    status,
    docCount,
    counts: {
      quotations: quotations.length,
      pos: pos.length,
      schedules: schedules.length,
      basts: basts.length,
      invoicesIn: invIn.length,
      invoicesOut: invOut.length,
    },
    updatedAt: new Date().toISOString(),
  }
  await db.collection('projects').updateOne({ id: projectId }, { $set: update })
  return { ...clean(project), ...update }
}

async function ensureProject(db, body, user) {
  if (body.projectId) {
    const existing = await db.collection('projects').findOne({ id: body.projectId })
    if (existing) return existing
  }
  const now = new Date().toISOString()
  const project = {
    id: uuidv4(),
    projectId: await nextProjectId(db),
    customer: body.customer || body.companyName || '',
    businessLine: body.businessLine || 'Trading',
    projectName: body.projectName || body.opportunity || 'Project Baru',
    salesPic: body.salesPic || user?.name || '',
    currentStage: 'Approach',
    status: 'Belum Jalan',
    revenue: 0,
    hpp: 0,
    margin: 0,
    marginPct: 0,
    poQty: 0,
    deliveredQty: 0,
    remainingQty: 0,
    docCount: 0,
    createdAt: now,
    updatedAt: now,
    createdBy: user?.name || 'system',
  }
  await db.collection('projects').insertOne(project)
  return project
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------
async function computeAlerts(db, settings) {
  const rules = settings.notificationRules
  const today = todayISO()
  const soon = addDays(rules.invoiceDueDays || 7)
  const staleDate = new Date(Date.now() - (rules.projectStaleDays || 14) * 86400000).toISOString()
  const alerts = []

  const docs = await db.collection('documents').find({}, { projection: { entityId: 1 } }).toArray()
  const docSet = new Set(docs.map((d) => d.entityId))

  if (rules.quotationNoAttachment) {
    const qs = await db.collection('quotations').find({ status: { $nin: ['Lost'] } }).toArray()
    const missing = qs.filter((q) => !docSet.has(q.id))
    if (missing.length) alerts.push({ type: 'warning', count: missing.length, text: `${missing.length} penawaran belum upload file`, href: '/penawaran?filter=noDoc' })
  }
  if (rules.poNoSchedule) {
    const pos = await db.collection('pos').find({ status: { $in: ['Confirmed', 'Running'] } }).toArray()
    const scheds = await db.collection('schedules').find({}, { projection: { poId: 1 } }).toArray()
    const withSched = new Set(scheds.map((s) => s.poId))
    const missing = pos.filter((p) => !withSched.has(p.id))
    if (missing.length) alerts.push({ type: 'warning', count: missing.length, text: `${missing.length} PO belum punya schedule`, href: '/po?filter=noSchedule' })
  }
  if (rules.scheduleOverdue) {
    const overdue = await db.collection('schedules').countDocuments({ scheduleDate: { $lt: today }, status: { $in: ['Not Started', 'Scheduled', 'In Transit', 'Delayed'] } })
    if (overdue) alerts.push({ type: 'danger', count: overdue, text: `${overdue} schedule terlambat / belum update`, href: '/schedule?filter=overdue' })
  }
  if (rules.bastMissing) {
    const delivered = await db.collection('schedules').find({ status: 'Delivered' }).toArray()
    const basts = await db.collection('basts').find({}, { projection: { deliveryRef: 1 } }).toArray()
    const bastRefs = new Set(basts.map((b) => b.deliveryRef))
    const missing = delivered.filter((s) => !bastRefs.has(s.id))
    if (missing.length) alerts.push({ type: 'warning', count: missing.length, text: `${missing.length} pengiriman selesai belum ada BAST`, href: '/bast?filter=missing' })
  }
  const outDueSoon = await db.collection('invoices_out').countDocuments({ outstanding: { $gt: 0 }, dueDate: { $gte: today, $lte: soon } })
  if (outDueSoon) alerts.push({ type: 'info', count: outDueSoon, text: `${outDueSoon} invoice out jatuh tempo ${rules.invoiceDueDays || 7} hari ke depan`, href: '/invoice-out?filter=dueSoon' })
  const outOverdue = await db.collection('invoices_out').countDocuments({ outstanding: { $gt: 0 }, dueDate: { $lt: today } })
  if (outOverdue) alerts.push({ type: 'danger', count: outOverdue, text: `${outOverdue} invoice out sudah lewat jatuh tempo`, href: '/invoice-out?filter=overdue' })
  const inDueSoon = await db.collection('invoices_in').countDocuments({ outstanding: { $gt: 0 }, dueDate: { $gte: today, $lte: soon } })
  if (inDueSoon) alerts.push({ type: 'info', count: inDueSoon, text: `${inDueSoon} invoice vendor jatuh tempo ${rules.invoiceDueDays || 7} hari ke depan`, href: '/invoice-in?filter=dueSoon' })
  const inOverdue = await db.collection('invoices_in').countDocuments({ outstanding: { $gt: 0 }, dueDate: { $lt: today } })
  if (inOverdue) alerts.push({ type: 'danger', count: inOverdue, text: `${inOverdue} invoice vendor lewat jatuh tempo`, href: '/invoice-in?filter=overdue' })
  const stale = await db.collection('projects').countDocuments({ status: { $in: ['Ongoing', 'Partial'] }, updatedAt: { $lt: staleDate } })
  if (stale) alerts.push({ type: 'warning', count: stale, text: `${stale} project belum update ${rules.projectStaleDays || 14} hari`, href: '/projects?filter=stale' })

  return alerts
}

// ---------------------------------------------------------------------------
// Period filter
// ---------------------------------------------------------------------------
function periodRange(period) {
  if (!period || period === 'all') return null
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const iso = (d) => d.toISOString().slice(0, 10)
  if (period === 'this_month') return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) }
  if (period === 'last_3_months') return { from: iso(new Date(y, m - 2, 1)), to: iso(new Date(y, m + 1, 0)) }
  if (period === 'this_year') return { from: `${y}-01-01`, to: `${y}-12-31` }
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [py, pm] = period.split('-').map(Number)
    return { from: iso(new Date(py, pm - 1, 1)), to: iso(new Date(py, pm, 0)) }
  }
  if (period.includes('_')) {
    const [from, to] = period.split('_')
    return { from, to }
  }
  return null
}
const inRange = (date, range) => !range || (date && date >= range.from && date <= range.to)

async function computeKpis(db, settings, filters = {}) {
  const projQuery = {}
  if (filters.businessLine && filters.businessLine !== 'All') projQuery.businessLine = filters.businessLine
  if (filters.salesPic) projQuery.salesPic = filters.salesPic
  if (filters.status) projQuery.status = filters.status
  if (filters.customer) projQuery.customer = filters.customer
  const projects = await db.collection('projects').find(projQuery).toArray()
  const projectIds = projects.map((p) => p.id)
  const range = periodRange(filters.period)
  const scoped = { projectId: { $in: projectIds } }
  const [invOut, invIn, pos, stocks] = await Promise.all([
    db.collection('invoices_out').find(scoped).toArray(),
    db.collection('invoices_in').find(scoped).toArray(),
    db.collection('pos').find({ ...scoped, status: { $ne: 'Cancelled' } }).toArray(),
    db.collection('stocks').find(projectIds.length ? { $or: [scoped, { projectId: { $in: [null, ''] } }] } : {}).toArray(),
  ])
  const invOutP = invOut.filter((i) => inRange(i.invoiceDate, range))
  const posP = pos.filter((p) => inRange(p.poDate, range))
  const projectsP = projects.filter((p) => inRange((p.createdAt || '').slice(0, 10), range))

  let omzet = 0
  if (settings.revenueBasis === 'po_value') omzet = posP.reduce((s, p) => s + num(p.poValue), 0)
  else if (settings.revenueBasis === 'completed_project') omzet = projectsP.filter((p) => p.status === 'Finish').reduce((s, p) => s + num(p.revenue), 0)
  else omzet = invOutP.reduce((s, i) => s + num(i.amount), 0)

  const revenueBase = projectsP.filter((p) => p.status !== 'Cancelled')
  const totalRevenue = revenueBase.reduce((s, p) => s + num(p.revenue), 0)
  const margin = revenueBase.reduce((s, p) => s + (num(p.revenue) - num(p.hpp)), 0)
  const piutang = invOut.reduce((s, i) => s + num(i.outstanding), 0)
  const utang = invIn.reduce((s, i) => s + num(i.outstanding), 0)
  const stok = stocks.reduce((s, i) => s + num(i.stockValue), 0)

  return {
    omzet,
    margin,
    marginPct: totalRevenue > 0 ? Math.round((margin / totalRevenue) * 1000) / 10 : 0,
    totalRevenue,
    piutang,
    utang,
    stok,
    activeProjects: projects.filter((p) => ['Ongoing', 'Partial'].includes(p.status)).length,
    finishedProjects: projects.filter((p) => p.status === 'Finish').length,
    revenueBasis: settings.revenueBasis,
    projects,
    invOut,
    invIn,
    pos,
    range,
  }
}

function agingBuckets(invoices) {
  const today = new Date(todayISO())
  const buckets = { 'Belum Jatuh Tempo': 0, '1-30 hari': 0, '31-60 hari': 0, '61-90 hari': 0, '>90 hari': 0 }
  for (const inv of invoices) {
    const out = num(inv.outstanding)
    if (out <= 0) continue
    const due = inv.dueDate ? new Date(inv.dueDate) : today
    const days = Math.floor((today - due) / 86400000)
    if (days <= 0) buckets['Belum Jatuh Tempo'] += out
    else if (days <= 30) buckets['1-30 hari'] += out
    else if (days <= 60) buckets['31-60 hari'] += out
    else if (days <= 90) buckets['61-90 hari'] += out
    else buckets['>90 hari'] += out
  }
  return Object.entries(buckets).map(([name, value]) => ({ name, value }))
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 200 }))
}

async function handleRoute(request, { params }) {
  const { path: segments = [] } = await params
  const route = `/${segments.join('/')}`
  const method = request.method
  const url = new URL(request.url)
  const q = Object.fromEntries(url.searchParams.entries())

  try {
    const db = await connectToMongo()

    if ((route === '/' || route === '/root') && method === 'GET') return json({ message: 'Across Pipeline API', ok: true })

    // ---------------- Seed ----------------
    if (route === '/seed' && method === 'POST') {
      await seedDatabase(db, true)
      return json({ ok: true, message: 'Database seeded' })
    }

    // ---------------- Auth ----------------
    if (route === '/auth/login' && method === 'POST') {
      const body = await request.json()
      const user = await db.collection('users').findOne({ email: String(body.email || '').toLowerCase().trim() })
      if (!user || !verifyPassword(String(body.password || ''), user.password)) return error('Email atau password salah', 401)
      const token = uuidv4()
      await db.collection('sessions').insertOne({ token, userId: user.id, createdAt: new Date().toISOString() })
      const { password, _id, ...safe } = user
      const res = json({ user: safe, token })
      res.headers.append('Set-Cookie', `across_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`)
      return res
    }
    if (route === '/auth/logout' && method === 'POST') {
      const token = getCookie(request, 'across_session')
      if (token) await db.collection('sessions').deleteOne({ token })
      const res = json({ ok: true })
      res.headers.append('Set-Cookie', 'across_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0')
      return res
    }
    if (route === '/auth/demo-users' && method === 'GET') {
      const users = await db.collection('users').find({}, { projection: { password: 0, _id: 0 } }).toArray()
      return json(users.map((u) => ({ ...u, demoPassword: 'across123' })))
    }

    const user = await getUser(request, db)
    if (!user) return error('Unauthorized', 401)

    if (route === '/auth/me' && method === 'GET') return json({ user })

    // ---------------- Files ----------------
    if (segments[0] === 'files' && segments[1] && method === 'GET') {
      const doc = await db.collection('documents').findOne({ id: segments[1] })
      if (!doc) return error('File not found', 404)
      const filePath = path.join(UPLOAD_DIR, doc.storedName)
      if (!fs.existsSync(filePath)) return error('File missing on disk', 404)
      const buffer = fs.readFileSync(filePath)
      const disposition = q.download === '1' ? 'attachment' : 'inline'
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': doc.mimeType || 'application/octet-stream',
          'Content-Length': String(buffer.length),
          'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
          'Cache-Control': 'private, max-age=3600',
        },
      })
    }

    if (route === '/upload' && method === 'POST') {
      if (user.role === 'management') return error('Management bersifat read-only', 403)
      ensureUploadDir()
      const form = await request.formData()
      const file = form.get('file')
      if (!file || typeof file === 'string') return error('File wajib diisi')
      const entityType = form.get('entityType') || 'projects'
      const entityId = form.get('entityId') || ''
      let projectId = form.get('projectId') || ''
      const category = form.get('category') || ''
      const replaceId = form.get('replaceId') || ''
      if (!projectId && entityId && COLLECTIONS[entityType]) {
        const rec = await db.collection(COLLECTIONS[entityType]).findOne({ id: entityId })
        projectId = rec?.projectId || (entityType === 'projects' ? entityId : '')
      }
      const bytes = Buffer.from(await file.arrayBuffer())
      const ext = path.extname(file.name || '') || ''
      const storedName = `${uuidv4()}${ext}`
      fs.writeFileSync(path.join(UPLOAD_DIR, storedName), bytes)
      const doc = {
        id: uuidv4(),
        fileName: file.name || storedName,
        storedName,
        size: bytes.length,
        mimeType: file.type || 'application/octet-stream',
        entityType,
        entityId,
        projectId,
        category,
        uploadedBy: user.name,
        uploadedAt: new Date().toISOString(),
      }
      if (replaceId) {
        const old = await db.collection('documents').findOne({ id: replaceId })
        if (old) {
          try { fs.unlinkSync(path.join(UPLOAD_DIR, old.storedName)) } catch (e) {}
          await db.collection('documents').deleteOne({ id: replaceId })
          doc.id = replaceId
        }
      }
      await db.collection('documents').insertOne(doc)
      if (projectId) await recomputeProject(db, projectId)
      return json(clean(doc), 201)
    }

    if (segments[0] === 'documents') {
      if (method === 'GET' && !segments[1]) {
        const query = {}
        if (q.entityType) query.entityType = q.entityType
        if (q.entityId) query.entityId = q.entityId
        if (q.projectId) query.projectId = q.projectId
        const docs = await db.collection('documents').find(query).sort({ uploadedAt: -1 }).limit(500).toArray()
        return json(docs.map(clean))
      }
      if (method === 'DELETE' && segments[1]) {
        if (user.role === 'management') return error('Management bersifat read-only', 403)
        const doc = await db.collection('documents').findOne({ id: segments[1] })
        if (!doc) return error('Not found', 404)
        try { fs.unlinkSync(path.join(UPLOAD_DIR, doc.storedName)) } catch (e) {}
        await db.collection('documents').deleteOne({ id: segments[1] })
        if (doc.projectId) await recomputeProject(db, doc.projectId)
        return json({ ok: true })
      }
    }

    // ---------------- Settings ----------------
    if (route === '/settings' && method === 'GET') return json(await getSettings(db))
    if (route === '/settings' && method === 'PUT') {
      if (!['admin', 'management'].includes(user.role)) return error('Hanya admin / management', 403)
      const body = await request.json()
      const { id, _id, ...rest } = body
      await db.collection('settings').updateOne({ id: 'global' }, { $set: rest }, { upsert: true })
      return json(await getSettings(db))
    }

    // ---------------- Search ----------------
    if (route === '/search' && method === 'GET') {
      const term = (q.q || '').trim()
      if (!term) return json([])
      const rx = { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
      const [projects, quotations, pos, invIn, invOut, basts] = await Promise.all([
        db.collection('projects').find({ $or: [{ projectId: rx }, { customer: rx }, { projectName: rx }] }).limit(6).toArray(),
        db.collection('quotations').find({ quotationNumber: rx }).limit(4).toArray(),
        db.collection('pos').find({ poNumber: rx }).limit(4).toArray(),
        db.collection('invoices_in').find({ invoiceNumber: rx }).limit(4).toArray(),
        db.collection('invoices_out').find({ invoiceNumber: rx }).limit(4).toArray(),
        db.collection('basts').find({ bastNumber: rx }).limit(4).toArray(),
      ])
      const results = [
        ...projects.map((p) => ({ type: 'Project', title: `${p.projectId} · ${p.customer}`, subtitle: p.projectName, href: `/projects/${p.id}` })),
        ...quotations.map((x) => ({ type: 'Penawaran', title: x.quotationNumber, subtitle: x.customer, href: `/penawaran?q=${encodeURIComponent(x.quotationNumber)}` })),
        ...pos.map((x) => ({ type: 'PO', title: x.poNumber, subtitle: x.customer, href: `/po?q=${encodeURIComponent(x.poNumber)}` })),
        ...basts.map((x) => ({ type: 'BAST', title: x.bastNumber, subtitle: '', href: `/bast?q=${encodeURIComponent(x.bastNumber)}` })),
        ...invIn.map((x) => ({ type: 'Invoice In', title: x.invoiceNumber, subtitle: x.vendor, href: `/invoice-in?q=${encodeURIComponent(x.invoiceNumber)}` })),
        ...invOut.map((x) => ({ type: 'Invoice Out', title: x.invoiceNumber, subtitle: x.customer, href: `/invoice-out?q=${encodeURIComponent(x.invoiceNumber)}` })),
      ]
      return json(results)
    }

    // ---------------- Dashboard ----------------
    if (route === '/dashboard' && method === 'GET') {
      const settings = await getSettings(db)
      const kpi = await computeKpis(db, settings, q)
      const projQuery = {}
      if (q.businessLine && q.businessLine !== 'All') projQuery.businessLine = q.businessLine
      if (q.salesPic) projQuery.salesPic = q.salesPic
      if (q.status) projQuery.status = q.status
      const [approaches, quotations, pos, schedules, basts, invIn, invOut, recent, alerts, salesPics] = await Promise.all([
        db.collection('approaches').countDocuments(projQuery.businessLine ? { businessLine: projQuery.businessLine } : {}),
        db.collection('quotations').find(projQuery.businessLine ? { businessLine: projQuery.businessLine } : {}).toArray(),
        db.collection('pos').find({ projectId: { $in: kpi.projects.map((p) => p.id) } }).toArray(),
        db.collection('schedules').countDocuments({ projectId: { $in: kpi.projects.map((p) => p.id) } }),
        db.collection('basts').countDocuments({ projectId: { $in: kpi.projects.map((p) => p.id) } }),
        db.collection('invoices_in').find({ projectId: { $in: kpi.projects.map((p) => p.id) } }).toArray(),
        db.collection('invoices_out').find({ projectId: { $in: kpi.projects.map((p) => p.id) } }).toArray(),
        db.collection('projects').find(projQuery).sort({ updatedAt: -1 }).limit(8).toArray(),
        computeAlerts(db, settings),
        db.collection('projects').distinct('salesPic'),
      ])
      const pipeline = [
        { key: 'approach', label: 'Approach', count: approaches, href: '/approach' },
        { key: 'penawaran', label: 'Penawaran', count: quotations.length, value: quotations.reduce((s, x) => s + num(x.revenue), 0), href: '/penawaran' },
        { key: 'po', label: 'PO', count: pos.length, value: pos.reduce((s, x) => s + num(x.poValue), 0), href: '/po' },
        { key: 'schedule', label: 'Schedule', count: schedules, href: '/schedule' },
        { key: 'bast', label: 'BAST', count: basts, href: '/bast' },
        { key: 'invoice-in', label: 'Invoice In', count: invIn.length, value: invIn.reduce((s, x) => s + num(x.amount), 0), href: '/invoice-in' },
        { key: 'invoice-out', label: 'Invoice Out', count: invOut.length, value: invOut.reduce((s, x) => s + num(x.amount), 0), href: '/invoice-out' },
      ]
      const { projects, invOut: _a, invIn: _b, pos: _c, range, ...kpis } = kpi
      return json({ kpis, pipeline, recentProjects: recent.map(clean), alerts, salesPics: salesPics.filter(Boolean), totalProjects: projects.length })
    }

    // ---------------- Summary ----------------
    if (route === '/summary' && method === 'GET') {
      const settings = await getSettings(db)
      const kpi = await computeKpis(db, settings, q)
      const { projects, invOut, invIn, pos, range, ...kpis } = kpi
      const projMap = Object.fromEntries(projects.map((p) => [p.id, p]))

      // months (last 6 or range)
      const months = []
      const now = new Date()
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      }
      const label = (mk) => {
        const [y, m] = mk.split('-')
        return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('id-ID', { month: 'short', year: '2-digit' })
      }
      const byMonth = months.map((mk) => {
        const invs = invOut.filter((i) => monthKey(i.invoiceDate) === mk)
        const omzet = invs.reduce((s, i) => s + num(i.amount), 0)
        const margin = invs.reduce((s, i) => s + num(i.amount) * (num(projMap[i.projectId]?.marginPct) / 100), 0)
        const trading = invs.filter((i) => projMap[i.projectId]?.businessLine === 'Trading').reduce((s, i) => s + num(i.amount), 0)
        const logistics = invs.filter((i) => projMap[i.projectId]?.businessLine === 'Logistics').reduce((s, i) => s + num(i.amount), 0)
        return { month: label(mk), key: mk, omzet, margin: Math.round(margin), trading, logistics }
      })
      const contribution = ['Trading', 'Logistics'].map((bl) => ({
        name: bl,
        value: invOut.filter((i) => projMap[i.projectId]?.businessLine === bl).reduce((s, i) => s + num(i.amount), 0),
        projects: projects.filter((p) => p.businessLine === bl).length,
      }))
      const stageCounts = STAGE_ORDER.map((stage) => ({ name: stage, value: projects.filter((p) => p.currentStage === stage).length }))
      const customers = await db.collection('projects').distinct('customer')
      return json({
        kpis,
        byMonth,
        contribution,
        stageCounts,
        agingReceivable: agingBuckets(invOut),
        agingPayable: agingBuckets(invIn),
        customers: customers.filter(Boolean),
        topProjects: [...projects].sort((a, b) => num(b.revenue) - num(a.revenue)).slice(0, 5).map(clean),
      })
    }

    if (route === '/alerts' && method === 'GET') {
      return json(await computeAlerts(db, await getSettings(db)))
    }

    if (route === '/meta' && method === 'GET') {
      const [projects, salesPics, customers, vendors, settings] = await Promise.all([
        db.collection('projects').find({}, { projection: { _id: 0, id: 1, projectId: 1, customer: 1, projectName: 1, businessLine: 1, salesPic: 1, status: 1, unit: 1, poQty: 1 } }).sort({ projectId: -1 }).toArray(),
        db.collection('users').distinct('name'),
        db.collection('projects').distinct('customer'),
        db.collection('pos').distinct('vendor'),
        getSettings(db),
      ])
      const pos = await db.collection('pos').find({}, { projection: { _id: 0, id: 1, poNumber: 1, projectId: 1, quantity: 1, unit: 1, customer: 1 } }).toArray()
      return json({ projects, pos, salesPics: salesPics.filter(Boolean), customers: customers.filter(Boolean), vendors: vendors.filter(Boolean), settings })
    }

    // ---------------- Project detail (full) ----------------
    if (segments[0] === 'projects' && segments[1] && segments[2] === 'full' && method === 'GET') {
      const project = await recomputeProject(db, segments[1])
      if (!project) return error('Project not found', 404)
      const pid = segments[1]
      const [approaches, quotations, pos, schedules, basts, invIn, invOut, documents, stocks] = await Promise.all([
        db.collection('approaches').find({ projectId: pid }).toArray(),
        db.collection('quotations').find({ projectId: pid }).sort({ createdAt: -1 }).toArray(),
        db.collection('pos').find({ projectId: pid }).sort({ poDate: -1 }).toArray(),
        db.collection('schedules').find({ projectId: pid }).sort({ scheduleDate: 1 }).toArray(),
        db.collection('basts').find({ projectId: pid }).sort({ bastDate: -1 }).toArray(),
        db.collection('invoices_in').find({ projectId: pid }).sort({ invoiceDate: -1 }).toArray(),
        db.collection('invoices_out').find({ projectId: pid }).sort({ invoiceDate: -1 }).toArray(),
        db.collection('documents').find({ projectId: pid }).sort({ uploadedAt: -1 }).toArray(),
        db.collection('stocks').find({ projectId: pid }).toArray(),
      ])
      const docCounts = {}
      for (const d of documents) docCounts[d.entityId] = (docCounts[d.entityId] || 0) + 1
      const withDocs = (arr) => arr.map((r) => ({ ...clean(r), docCount: docCounts[r.id] || 0 }))
      return json({
        project,
        approaches: withDocs(approaches),
        quotations: withDocs(quotations),
        pos: withDocs(pos),
        schedules: withDocs(schedules),
        basts: withDocs(basts),
        invoicesIn: withDocs(invIn),
        invoicesOut: withDocs(invOut),
        stocks: withDocs(stocks),
        documents: documents.map(clean),
      })
    }

    // ---------------- Conversions ----------------
    if (segments[0] === 'approaches' && segments[1] && segments[2] === 'convert' && method === 'POST') {
      if (!canWrite(user, 'quotations')) return error('Tidak punya akses', 403)
      const ap = await db.collection('approaches').findOne({ id: segments[1] })
      if (!ap) return error('Approach not found', 404)
      let project = ap.projectId ? await db.collection('projects').findOne({ id: ap.projectId }) : null
      if (!project) {
        project = await ensureProject(db, { customer: ap.companyName, businessLine: ap.businessLine, projectName: ap.opportunity, salesPic: ap.salesPic }, user)
        await db.collection('approaches').updateOne({ id: ap.id }, { $set: { projectId: project.id, status: 'Qualified', updatedAt: new Date().toISOString() } })
      }
      await recomputeProject(db, project.id)
      return json({
        project: clean(project),
        prefill: {
          projectId: project.id,
          customer: ap.companyName,
          projectName: ap.opportunity,
          salesPic: ap.salesPic,
          businessLine: ap.businessLine,
          customerPic: ap.customerPic,
        },
      })
    }
    if (segments[0] === 'quotations' && segments[1] && segments[2] === 'convert-po' && method === 'POST') {
      if (!canWrite(user, 'pos')) return error('Tidak punya akses', 403)
      const qt = await db.collection('quotations').findOne({ id: segments[1] })
      if (!qt) return error('Quotation not found', 404)
      if (qt.status !== 'Approved') await db.collection('quotations').updateOne({ id: qt.id }, { $set: { status: 'Approved' } })
      return json({
        prefill: {
          projectId: qt.projectId,
          customer: qt.customer,
          poValue: qt.revenue,
          quotationId: qt.id,
          quotationNumber: qt.quotationNumber,
          unit: qt.unit || '',
        },
      })
    }

    // ---------------- Generic CRUD ----------------
    const key = segments[0]
    const colName = COLLECTIONS[key]
    if (colName) {
      const col = db.collection(colName)
      const id = segments[1]

      if (method === 'GET' && !id) {
        const query = {}
        const filter = q.filter
        for (const f of ['projectId', 'status', 'businessLine', 'salesPic', 'customer', 'vendor', 'poId', 'role']) {
          if (q[f]) query[f] = q[f]
        }
        if (q.q) {
          const rx = { $regex: q.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
          const fields = {
            approaches: ['companyName', 'customerPic', 'opportunity', 'salesPic'],
            quotations: ['quotationNumber', 'customer', 'projectName'],
            pos: ['poNumber', 'customer', 'vendor'],
            schedules: ['deliveryNumber', 'origin', 'destination', 'vendor'],
            basts: ['bastNumber'],
            'invoices-in': ['invoiceNumber', 'vendor'],
            'invoices-out': ['invoiceNumber', 'customer'],
            stocks: ['item'],
            projects: ['projectId', 'customer', 'projectName'],
            users: ['name', 'email'],
          }[key] || []
          if (fields.length) query.$or = fields.map((f) => ({ [f]: rx }))
        }
        const today = todayISO()
        if (filter === 'overdue' && (key === 'invoices-in' || key === 'invoices-out')) { query.outstanding = { $gt: 0 }; query.dueDate = { $lt: today } }
        if (filter === 'dueSoon' && (key === 'invoices-in' || key === 'invoices-out')) { query.outstanding = { $gt: 0 }; query.dueDate = { $gte: today, $lte: addDays(7) } }
        if (filter === 'overdue' && key === 'schedules') { query.scheduleDate = { $lt: today }; query.status = { $in: ['Not Started', 'Scheduled', 'In Transit', 'Delayed'] } }
        if (filter === 'stale' && key === 'projects') { query.status = { $in: ['Ongoing', 'Partial'] }; query.updatedAt = { $lt: new Date(Date.now() - 14 * 86400000).toISOString() } }

        let items = await col.find(query, { projection: key === 'users' ? { password: 0 } : {} }).sort({ createdAt: -1 }).toArray()

        // enrich with docCount
        const ids = items.map((i) => i.id)
        const docs = await db.collection('documents').aggregate([{ $match: { entityId: { $in: ids } } }, { $group: { _id: '$entityId', count: { $sum: 1 } } }]).toArray()
        const docMap = Object.fromEntries(docs.map((d) => [d._id, d.count]))
        items = items.map((i) => ({ ...clean(i), docCount: docMap[i.id] || 0 }))

        if (key === 'pos') {
          const scheds = await db.collection('schedules').find({ poId: { $in: ids } }).toArray()
          items = items.map((p) => {
            const mine = scheds.filter((s) => s.poId === p.id)
            const delivered = mine.filter((s) => s.status === 'Delivered').reduce((s, r) => s + num(r.qty), 0)
            const scheduled = mine.filter((s) => s.status !== 'Cancelled').reduce((s, r) => s + num(r.qty), 0)
            return { ...p, deliveredQty: delivered, scheduledQty: scheduled, remainingQty: Math.max(0, num(p.quantity) - delivered), completionPct: p.quantity > 0 ? Math.min(100, Math.round((delivered / p.quantity) * 100)) : 0, scheduleCount: mine.length }
          })
          if (filter === 'noSchedule') items = items.filter((p) => p.scheduleCount === 0 && ['Confirmed', 'Running'].includes(p.status))
        }
        if (filter === 'noDoc') items = items.filter((i) => i.docCount === 0)
        if (key === 'basts' && filter === 'missing') {
          // return delivered schedules without BAST as "pending" list marker
          const delivered = await db.collection('schedules').find({ status: 'Delivered' }).toArray()
          const refs = new Set(items.map((b) => b.deliveryRef))
          const pending = delivered.filter((s) => !refs.has(s.id)).map(clean)
          return json({ items: [], total: 0, pendingSchedules: pending })
        }

        // project info enrich
        const projIds = [...new Set(items.map((i) => i.projectId).filter(Boolean))]
        if (projIds.length) {
          const projs = await db.collection('projects').find({ id: { $in: projIds } }, { projection: { _id: 0, id: 1, projectId: 1, customer: 1, projectName: 1, businessLine: 1 } }).toArray()
          const pm = Object.fromEntries(projs.map((p) => [p.id, p]))
          items = items.map((i) => ({ ...i, project: pm[i.projectId] || null }))
        }

        const total = items.length
        const page = Math.max(1, parseInt(q.page || '1', 10))
        const limit = Math.min(200, Math.max(1, parseInt(q.limit || '50', 10)))
        const paged = items.slice((page - 1) * limit, page * limit)
        return json({ items: paged, total, page, limit })
      }

      if (method === 'GET' && id) {
        const item = await col.findOne({ id }, { projection: key === 'users' ? { password: 0 } : {} })
        if (!item) return error('Not found', 404)
        const docs = await db.collection('documents').find({ entityId: id }).sort({ uploadedAt: -1 }).toArray()
        return json({ ...clean(item), documents: docs.map(clean) })
      }

      if (method === 'POST' && !id) {
        if (!canWrite(user, key)) return error('Role Anda tidak punya akses menulis di sini', 403)
        const body = normalizeRecord(key, await request.json())
        const now = new Date().toISOString()
        if (key === 'users') {
          if (!body.email || !body.password) return error('Email & password wajib')
          body.email = String(body.email).toLowerCase().trim()
          const exists = await col.findOne({ email: body.email })
          if (exists) return error('Email sudah terdaftar')
          body.password = hashPassword(body.password)
        }
        if (key === 'projects') {
          body.projectId = body.projectId || (await nextProjectId(db))
          if (body.revenue || body.hpp) body.manualRevenue = true
        }
        // auto-create project for quotations / approach if requested
        if (['quotations', 'pos', 'schedules', 'basts', 'invoices-in', 'invoices-out'].includes(key) && !body.projectId) {
          if (key === 'quotations' && body.customer) {
            const p = await ensureProject(db, body, user)
            body.projectId = p.id
          } else if (key === 'pos' && body.customer) {
            const p = await ensureProject(db, body, user)
            body.projectId = p.id
          } else {
            return error('Project wajib dipilih')
          }
        }
        if (key === 'approaches' && body.createProject) {
          const p = await ensureProject(db, body, user)
          body.projectId = p.id
        }
        delete body.createProject
        const record = { id: uuidv4(), ...body, createdAt: now, updatedAt: now, createdBy: user.name }
        await col.insertOne(record)
        if (record.projectId) await recomputeProject(db, record.projectId)
        const { password, ...safe } = record
        return json(clean(safe), 201)
      }

      if ((method === 'PUT' || method === 'PATCH') && id) {
        if (!canWrite(user, key)) return error('Role Anda tidak punya akses menulis di sini', 403)
        const existing = await col.findOne({ id })
        if (!existing) return error('Not found', 404)
        const patch = await request.json()
        delete patch.id
        delete patch._id
        delete patch.createdAt
        delete patch.documents
        delete patch.docCount
        delete patch.project
        let merged = normalizeRecord(key, { ...clean(existing), ...patch })
        if (key === 'users') {
          if (patch.password) merged.password = hashPassword(patch.password)
          else merged.password = existing.password
        }
        if (key === 'projects') {
          if (patch.revenue !== undefined || patch.hpp !== undefined) merged.manualRevenue = true
          if (patch.status !== undefined) merged.statusOverride = patch.status || null
        }
        merged.updatedAt = new Date().toISOString()
        merged.updatedBy = user.name
        const { id: _i, ...setDoc } = merged
        await col.updateOne({ id }, { $set: setDoc })
        if (merged.projectId) await recomputeProject(db, merged.projectId)
        if (key === 'projects') await recomputeProject(db, id)
        if (existing.projectId && existing.projectId !== merged.projectId) await recomputeProject(db, existing.projectId)
        const updated = await col.findOne({ id }, { projection: key === 'users' ? { password: 0 } : {} })
        return json(clean(updated))
      }

      if (method === 'DELETE' && id) {
        if (!canWrite(user, key)) return error('Role Anda tidak punya akses menulis di sini', 403)
        const existing = await col.findOne({ id })
        if (!existing) return error('Not found', 404)
        await col.deleteOne({ id })
        const docs = await db.collection('documents').find({ entityId: id }).toArray()
        for (const d of docs) { try { fs.unlinkSync(path.join(UPLOAD_DIR, d.storedName)) } catch (e) {} }
        await db.collection('documents').deleteMany({ entityId: id })
        if (existing.projectId) await recomputeProject(db, existing.projectId)
        return json({ ok: true })
      }
    }

    return error(`Route ${route} not found`, 404)
  } catch (err) {
    console.error('API Error:', err)
    return error(err.message || 'Internal server error', 500)
  }
}

export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute

// ---------------------------------------------------------------------------
// SEED
// ---------------------------------------------------------------------------
function makePdf(title, lines = []) {
  const esc = (s) => String(s).replace(/[\\()]/g, (c) => '\\' + c)
  let content = `BT /F1 20 Tf 50 780 Td (${esc(title)}) Tj ET\n`
  let y = 740
  for (const l of lines) {
    content += `BT /F1 12 Tf 50 ${y} Td (${esc(l)}) Tj ET\n`
    y -= 20
  }
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) pdf += `${String(o).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf)
}

async function seedDatabase(db, reset = false) {
  ensureUploadDir()
  const names = ['users', 'sessions', 'projects', 'approaches', 'quotations', 'pos', 'schedules', 'basts', 'invoices_in', 'invoices_out', 'stocks', 'documents', 'settings']
  if (reset) for (const n of names) await db.collection(n).deleteMany({})

  const now = new Date().toISOString()
  const D = (days) => addDays(days)
  const year = new Date().getFullYear()
  const PID = (n) => `PRJ-${year}-${String(n).padStart(4, '0')}`

  const users = [
    { name: 'Rina Management', email: 'management@across.id', role: 'management' },
    { name: 'Andi Pratama', email: 'sales@across.id', role: 'sales' },
    { name: 'Dedi Operasional', email: 'ops@across.id', role: 'operations' },
    { name: 'Fitri Finance', email: 'finance@across.id', role: 'finance' },
    { name: 'Admin Across', email: 'admin@across.id', role: 'admin' },
  ].map((u) => ({ id: uuidv4(), ...u, password: hashPassword('across123'), createdAt: now }))
  await db.collection('users').insertMany(users)
  await db.collection('settings').insertOne({ ...DEFAULT_SETTINGS })

  const documents = []
  const addDoc = (entityType, entityId, projectId, fileName, category, by = 'Admin Across', daysAgo = 5) => {
    const storedName = `${uuidv4()}.pdf`
    const buf = makePdf(fileName.replace('.pdf', ''), [`Across Pipeline Dashboard - dokumen contoh`, `Kategori: ${category}`, `Dibuat otomatis untuk preview.`])
    fs.writeFileSync(path.join(UPLOAD_DIR, storedName), buf)
    documents.push({ id: uuidv4(), fileName, storedName, size: buf.length, mimeType: 'application/pdf', entityType, entityId, projectId, category, uploadedBy: by, uploadedAt: new Date(Date.now() - daysAgo * 86400000).toISOString() })
  }

  // Projects
  const P = [
    { n: 1, customer: 'PT ABC Indonesia', bl: 'Trading', name: 'Supply Batubara 5.000 MT', sales: 'Andi Pratama', created: -60 },
    { n: 2, customer: 'PT Surya Logistik', bl: 'Logistics', name: 'Trucking Jakarta - Surabaya 120 Trip', sales: 'Budi Santoso', created: -95 },
    { n: 3, customer: 'PT Sentosa Abadi', bl: 'Trading', name: 'Supply CPO 2.000 MT', sales: 'Citra Dewi', created: -30 },
    { n: 4, customer: 'PT Global Utama', bl: 'Logistics', name: 'Container Handling 40 Container', sales: 'Dian Kusuma', created: -25 },
    { n: 5, customer: 'PT Prima Logistik', bl: 'Logistics', name: 'Distribusi Semen Jawa Tengah', sales: 'Andi Pratama', created: -18 },
    { n: 6, customer: 'PT Nusantara Energi', bl: 'Trading', name: 'Supply Solar Industri 500 KL', sales: 'Budi Santoso', created: -12 },
    { n: 7, customer: 'PT ABC Indonesia', bl: 'Trading', name: 'Supply Nikel Ore 3.000 MT', sales: 'Citra Dewi', created: -80 },
    { n: 8, customer: 'PT Surya Logistik', bl: 'Logistics', name: 'Sewa Armada Bulanan Q3', sales: 'Dian Kusuma', created: -6 },
    { n: 9, customer: 'PT Sentosa Abadi', bl: 'Trading', name: 'Supply Pupuk NPK 800 MT', sales: 'Andi Pratama', created: -50 },
    { n: 10, customer: 'PT Global Utama', bl: 'Logistics', name: 'Trucking Tambang Kalimantan', sales: 'Budi Santoso', created: -70 },
  ]
  const projects = P.map((p) => ({
    id: uuidv4(), projectId: PID(p.n), customer: p.customer, businessLine: p.bl, projectName: p.name, salesPic: p.sales,
    currentStage: 'Approach', status: 'Belum Jalan', revenue: 0, hpp: 0, margin: 0, marginPct: 0, poQty: 0, deliveredQty: 0, remainingQty: 0, docCount: 0,
    createdAt: new Date(Date.now() + p.created * 86400000).toISOString(), updatedAt: new Date(Date.now() + (p.created + 5) * 86400000).toISOString(), createdBy: 'Admin Across',
    statusOverride: p.n === 10 ? 'Cancelled' : null,
  }))
  const pr = (n) => projects[n - 1]
  await db.collection('projects').insertMany(projects)

  // Approaches (10 linked + 10 standalone)
  const approaches = []
  const contacts = ['Bapak Hendra', 'Ibu Sari', 'Bapak Yusuf', 'Ibu Maya', 'Bapak Rudi', 'Ibu Lestari']
  P.forEach((p, i) => {
    approaches.push({
      id: uuidv4(), projectId: pr(p.n).id, companyName: p.customer, customerPic: contacts[i % contacts.length], customerContact: `08${String(1200000000 + i * 7351).slice(0, 10)}`,
      salesPic: p.sales, businessLine: p.bl, opportunity: p.name, approachDate: D(p.created - 10), lastFollowUp: D(p.created - 2), nextAction: 'Follow up penawaran',
      status: p.n === 10 ? 'Lost' : 'Qualified', notes: 'Lead sudah dikonversi menjadi project.', createdAt: new Date(Date.now() + (p.created - 10) * 86400000).toISOString(), updatedAt: now, createdBy: p.sales,
    })
  })
  const standalone = [
    ['PT Mitra Baja Nusantara', 'Trading', 'Supply Scrap Besi 1.000 MT', 'New', -1, 'Kirim company profile'],
    ['PT Cahaya Agro', 'Trading', 'Supply Pupuk Organik', 'Contacted', -3, 'Jadwalkan meeting'],
    ['PT Karya Angkut Mandiri', 'Logistics', 'Trucking Distribusi Retail Jabodetabek', 'Follow Up', -5, 'Kirim estimasi harga'],
    ['PT Samudra Kargo', 'Logistics', 'Pengiriman Kontainer Makassar', 'Follow Up', -7, 'Follow up via WA'],
    ['PT Bumi Tambang Sejahtera', 'Trading', 'Supply Batubara Kalori 5.800', 'Qualified', -9, 'Siapkan penawaran'],
    ['PT Indo Pangan', 'Trading', 'Supply Gula Rafinasi', 'New', -2, 'Telepon PIC'],
    ['PT Trans Logistik Utama', 'Logistics', 'Sewa Truk Wingbox 10 Unit', 'Contacted', -4, 'Survey rute'],
    ['PT Energi Hijau', 'Trading', 'Supply Cangkang Sawit 3.000 MT', 'Lost', -20, '-'],
    ['PT Bintang Sembilan', 'Logistics', 'Handling Pelabuhan Tanjung Priok', 'Follow Up', -6, 'Kirim proposal revisi'],
    ['PT Sinar Kimia', 'Trading', 'Supply Soda Ash 200 MT', 'New', 0, 'Kunjungan pertama'],
  ]
  const salesList = ['Andi Pratama', 'Budi Santoso', 'Citra Dewi', 'Dian Kusuma']
  standalone.forEach((s, i) => {
    approaches.push({
      id: uuidv4(), projectId: null, companyName: s[0], customerPic: contacts[(i + 2) % contacts.length], customerContact: `08${String(1300000000 + i * 5311).slice(0, 10)}`,
      salesPic: salesList[i % 4], businessLine: s[1], opportunity: s[2], approachDate: D(s[4] - 7), lastFollowUp: D(s[4]), nextAction: s[5], status: s[3], notes: '',
      createdAt: new Date(Date.now() + (s[4] - 7) * 86400000).toISOString(), updatedAt: now, createdBy: salesList[i % 4],
    })
  })
  await db.collection('approaches').insertMany(approaches)

  // Quotations
  const Q = [
    [1, 'Q-2503-001', 4250000000, 3700000000, 'Approved', -55, 'MT', true],
    [2, 'Q-2502-014', 1250000000, 1062500000, 'Approved', -90, 'trip', true],
    [3, 'Q-2504-003', 3100000000, 2700000000, 'Approved', -26, 'MT', true],
    [4, 'Q-2504-006', 850000000, 720000000, 'Approved', -21, 'container', true],
    [5, 'Q-2504-009', 620000000, 530000000, 'Sent', -12, 'trip', false],
    [6, 'Q-2505-002', 6200000000, 5500000000, 'Negotiation', -8, 'liter', true],
    [7, 'Q-2502-008', 7500000000, 6400000000, 'Approved', -75, 'MT', true],
    [8, 'Q-2505-011', 450000000, 390000000, 'Draft', -3, 'unit', false],
    [9, 'Q-2503-012', 2000000000, 1720000000, 'Approved', -45, 'MT', true],
    [10, 'Q-2503-005', 1100000000, 980000000, 'Lost', -65, 'trip', true],
    [5, 'Q-2504-007', 680000000, 590000000, 'Lost', -16, 'trip', true],
    [6, 'Q-2504-015', 6500000000, 5700000000, 'Lost', -14, 'liter', true],
  ]
  const quotations = Q.map(([n, no, rev, hpp, status, d, unit, hasDoc]) => {
    const p = pr(n)
    const rec = {
      id: uuidv4(), projectId: p.id, customer: p.customer, projectName: p.projectName, salesPic: p.salesPic, businessLine: p.businessLine,
      quotationNumber: no, quotationDate: D(d), validUntil: D(d + 30), revenue: rev, hpp, margin: rev - hpp, marginPct: Math.round(((rev - hpp) / rev) * 10000) / 100, status, unit,
      notes: '', createdAt: new Date(Date.now() + d * 86400000).toISOString(), updatedAt: now, createdBy: p.salesPic,
    }
    if (hasDoc) addDoc('quotations', rec.id, p.id, `Penawaran-${no}.pdf`, 'Quotation', p.salesPic, -d)
    return rec
  })
  await db.collection('quotations').insertMany(quotations)

  // POs
  const PO = [
    [1, 'PO-ABC-2025-031', 4250000000, 5000, 'MT', 'PT Sumber Batubara', 'Running', -50],
    [2, 'PO-SL-0912', 1250000000, 120, 'trip', 'PT Armada Jaya', 'Completed', -85],
    [3, 'PO-SA-2025-07', 3100000000, 2000, 'MT', 'PT Mitra Sawit', 'Confirmed', -20],
    [4, 'PO-GU-1188', 850000000, 40, 'container', 'CV Trans Nusantara', 'Confirmed', -15],
    [7, 'PO-ABC-2025-019', 5000000000, 2000, 'MT', 'PT Mitra Tambang', 'Running', -70],
    [7, 'PO-ABC-2025-022', 2500000000, 1000, 'MT', 'PT Mitra Tambang', 'Running', -55],
    [9, 'PO-SA-2025-03', 1250000000, 500, 'MT', 'PT Pupuk Makmur', 'Completed', -42],
    [9, 'PO-SA-2025-04', 750000000, 300, 'MT', 'PT Pupuk Makmur', 'Completed', -35],
  ]
  const pos = PO.map(([n, no, val, qty, unit, vendor, status, d]) => {
    const p = pr(n)
    const rec = { id: uuidv4(), projectId: p.id, customer: p.customer, poNumber: no, poDate: D(d), poValue: val, quantity: qty, unit, vendor, status, notes: '', createdAt: new Date(Date.now() + d * 86400000).toISOString(), updatedAt: now, createdBy: p.salesPic }
    addDoc('pos', rec.id, p.id, `PO-${no}.pdf`, 'PO', p.salesPic, -d)
    return rec
  })
  await db.collection('pos').insertMany(pos)
  const poOf = (n, idx = 0) => pos.filter((x) => x.projectId === pr(n).id)[idx]

  // Schedules
  const S = [
    [1, 0, 'DLV-001', -40, -39, 'Stockpile Banjarmasin', 'Pelabuhan Cigading', 1000, 'MT', 'PT Sumber Batubara', 'Tongkang TB Sinar 01', 'Delivered'],
    [1, 0, 'DLV-002', -25, -24, 'Stockpile Banjarmasin', 'Pelabuhan Cigading', 1200, 'MT', 'PT Sumber Batubara', 'Tongkang TB Sinar 02', 'Delivered'],
    [1, 0, 'DLV-003', -2, null, 'Stockpile Banjarmasin', 'Pelabuhan Cigading', 800, 'MT', 'PT Sumber Batubara', 'Tongkang TB Sinar 03', 'In Transit'],
    [2, 0, 'TRIP-BATCH-1', -75, -60, 'Gudang Cakung Jakarta', 'DC Surabaya', 60, 'trip', 'PT Armada Jaya', 'Fuso 20 unit', 'Delivered'],
    [2, 0, 'TRIP-BATCH-2', -55, -40, 'Gudang Cakung Jakarta', 'DC Surabaya', 60, 'trip', 'PT Armada Jaya', 'Fuso 20 unit', 'Delivered'],
    [3, 0, 'DLV-CPO-01', 4, null, 'PKS Riau', 'Refinery Dumai', 1000, 'MT', 'PT Mitra Sawit', 'Truk Tangki 30 unit', 'Scheduled'],
    [7, 0, 'NKL-01', -60, -58, 'Site Konawe', 'Smelter Morowali', 1500, 'MT', 'PT Mitra Tambang', 'Tongkang', 'Delivered'],
    [7, 1, 'NKL-02', -5, null, 'Site Konawe', 'Smelter Morowali', 1500, 'MT', 'PT Mitra Tambang', 'Tongkang', 'Delayed'],
    [9, 0, 'NPK-01', -38, -37, 'Gudang Gresik', 'Gudang Customer Lampung', 500, 'MT', 'PT Pupuk Makmur', 'Truk Tronton 25 unit', 'Delivered'],
    [9, 1, 'NPK-02', -30, -29, 'Gudang Gresik', 'Gudang Customer Lampung', 300, 'MT', 'PT Pupuk Makmur', 'Truk Tronton 15 unit', 'Delivered'],
  ]
  const schedules = S.map(([n, poIdx, no, d, ad, origin, dest, qty, unit, vendor, armada, status]) => {
    const p = pr(n)
    const po = poOf(n, poIdx)
    const rec = { id: uuidv4(), projectId: p.id, poId: po.id, poNumber: po.poNumber, deliveryNumber: no, scheduleDate: D(d), actualDate: ad === null ? '' : D(ad), origin, destination: dest, qty, unit, vendor, armada, driver: '', status, notes: '', createdAt: new Date(Date.now() + (d - 3) * 86400000).toISOString(), updatedAt: now, createdBy: 'Dedi Operasional' }
    if (status === 'Delivered') addDoc('schedules', rec.id, p.id, `SuratJalan-${no}.pdf`, 'Surat Jalan', 'Dedi Operasional', -ad)
    return rec
  })
  await db.collection('schedules').insertMany(schedules)
  const schedByNo = (no) => schedules.find((s) => s.deliveryNumber === no)

  // BAST
  const B = [
    [1, 'DLV-001', 'BAST-ABC-001', -38, 1000, 'Verified'],
    [1, 'DLV-002', 'BAST-ABC-002', -23, 1200, 'Uploaded'],
    [2, 'TRIP-BATCH-1', 'BAST-SL-001', -58, 60, 'Complete'],
    [2, 'TRIP-BATCH-2', 'BAST-SL-002', -38, 60, 'Complete'],
    [7, 'NKL-01', 'BAST-NKL-001', -56, 1500, 'Verified'],
    [9, 'NPK-01', 'BAST-NPK-001', -36, 500, 'Complete'],
  ]
  const basts = B.map(([n, sNo, no, d, qty, status]) => {
    const p = pr(n)
    const s = schedByNo(sNo)
    const rec = { id: uuidv4(), projectId: p.id, poId: s.poId, deliveryRef: s.id, deliveryNumber: s.deliveryNumber, bastNumber: no, bastDate: D(d), qty, unit: s.unit, status, notes: '', createdAt: new Date(Date.now() + d * 86400000).toISOString(), updatedAt: now, createdBy: 'Dedi Operasional' }
    addDoc('basts', rec.id, p.id, `${no}.pdf`, 'BAST', 'Dedi Operasional', -d)
    if (status === 'Complete' || status === 'Verified') addDoc('basts', rec.id, p.id, `POD-${sNo}.pdf`, 'POD', 'Dedi Operasional', -d)
    return rec
  })
  await db.collection('basts').insertMany(basts)

  // Invoice In (vendor)
  const II = [
    [1, 'PT Sumber Batubara', 'INV-SB-2025-118', -30, 0, 1628000000, 800000000, 'Partial Paid'],
    [2, 'PT Armada Jaya', 'INV-AJ-0456', -50, -20, 1062500000, 1062500000, 'Paid'],
    [7, 'PT Mitra Tambang', 'INV-MT-2025-077', -45, -15, 3200000000, 1500000000, 'Overdue'],
    [9, 'PT Pupuk Makmur', 'INV-PM-2025-031', -25, 5, 1720000000, 1000000000, 'Partial Paid'],
    [3, 'PT Mitra Sawit', 'INV-MS-2025-009', -5, 25, 1350000000, 0, 'Received'],
  ]
  const invIn = II.map(([n, vendor, no, d, due, amount, paid, status]) => {
    const p = pr(n)
    const rec = { id: uuidv4(), projectId: p.id, vendor, invoiceNumber: no, invoiceDate: D(d), dueDate: D(due), amount, paidAmount: paid, outstanding: amount - paid, status, notes: '', createdAt: new Date(Date.now() + d * 86400000).toISOString(), updatedAt: now, createdBy: 'Fitri Finance' }
    addDoc('invoices-in', rec.id, p.id, `${no}.pdf`, 'Invoice', 'Fitri Finance', -d)
    return rec
  })
  await db.collection('invoices_in').insertMany(invIn)

  // Invoice Out (customer)
  const IO = [
    [1, 'INV-ACR-2025-041', -35, -5, 850000000, 850000000, 'Paid'],
    [1, 'INV-ACR-2025-052', -20, 10, 1020000000, 0, 'Sent'],
    [2, 'INV-ACR-2025-018', -55, -25, 1250000000, 1250000000, 'Paid'],
    [7, 'INV-ACR-2025-029', -50, -20, 3750000000, 1500000000, 'Overdue'],
    [9, 'INV-ACR-2025-047', -28, 4, 2000000000, 800000000, 'Partial Paid'],
  ]
  const invOut = IO.map(([n, no, d, due, amount, paid, status]) => {
    const p = pr(n)
    const rec = { id: uuidv4(), projectId: p.id, customer: p.customer, invoiceNumber: no, invoiceDate: D(d), dueDate: D(due), amount, paidAmount: paid, outstanding: amount - paid, status, notes: '', createdAt: new Date(Date.now() + d * 86400000).toISOString(), updatedAt: now, createdBy: 'Fitri Finance' }
    addDoc('invoices-out', rec.id, p.id, `${no}.pdf`, 'Invoice', 'Fitri Finance', -d)
    return rec
  })
  await db.collection('invoices_out').insertMany(invOut)

  // Stocks
  await db.collection('stocks').insertMany([
    { id: uuidv4(), item: 'Batubara GAR 4200', projectId: pr(1).id, currentStock: 400, unit: 'MT', stockValue: 340000000, lastUpdated: D(-2), notes: 'Stockpile Banjarmasin', createdAt: now, updatedAt: now, createdBy: 'Dedi Operasional' },
    { id: uuidv4(), item: 'CPO', projectId: pr(3).id, currentStock: 100, unit: 'MT', stockValue: 150000000, lastUpdated: D(-4), notes: 'Tangki PKS Riau', createdAt: now, updatedAt: now, createdBy: 'Dedi Operasional' },
    { id: uuidv4(), item: 'Pupuk NPK', projectId: pr(9).id, currentStock: 20, unit: 'MT', stockValue: 50000000, lastUpdated: D(-10), notes: 'Sisa gudang Gresik', createdAt: now, updatedAt: now, createdBy: 'Dedi Operasional' },
  ])

  if (documents.length) await db.collection('documents').insertMany(documents)

  for (const p of projects) await recomputeProject(db, p.id)
  // make project 4 look stale (no update 20 days)
  await db.collection('projects').updateOne({ id: pr(4).id }, { $set: { updatedAt: new Date(Date.now() - 20 * 86400000).toISOString() } })
}
