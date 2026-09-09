'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Plus, Search, Paperclip, Pencil, Trash2, ArrowRight, X, FolderOpen, ChevronLeft, ChevronRight, Filter, FileUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { StatusBadge } from './status-badge'
import { ResponsiveDrawer } from './responsive-drawer'
import { CurrencyInput } from './currency-input'
import { RecordDocuments, uploadFile, fileIcon } from './documents'
import { useAuth } from './auth-context'
import { STAGES, FIELD_LABELS, CURRENCY_FIELDS, DATE_FIELDS, ACTUAL_DATE_FIELDS, PCT_FIELDS, QTY_FIELDS } from '@/lib/stage-config'
import { api, fetcher, canWrite, formatIDR, formatCompact, formatDate, formatNumber, formatPct, daysUntil, todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'

const NONE = '__none__'
const NEW_PROJECT = '__new__'
export const money = (v) => `Rp ${formatCompact(v, false)}`

// ---------------------------------------------------------------------------
// Cell renderer
// ---------------------------------------------------------------------------
export function CellValue({ col, row }) {
  const v = row?.[col.key]
  switch (col.type) {
    case 'currency':
      return <span className={cn('tabular whitespace-nowrap', col.emphasize && Number(v) > 0 && 'font-semibold text-foreground')} title={formatIDR(v)}>{money(v)}</span>
    case 'percent':
      return <span className="tabular">{formatPct(v)}</span>
    case 'date':
      return <span className="whitespace-nowrap">{formatDate(v)}</span>
    case 'due': {
      const d = daysUntil(v)
      const outstanding = Number(row.outstanding) > 0
      return (
        <span className="whitespace-nowrap inline-flex items-center gap-1.5">
          {formatDate(v)}
          {outstanding && d !== null && d < 0 && <span className="text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded">{Math.abs(d)}h lewat</span>}
          {outstanding && d !== null && d >= 0 && d <= 7 && <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">{d}h lagi</span>}
        </span>
      )
    }
    case 'status':
    case 'bl':
      return <StatusBadge status={v} />
    case 'docs':
      return (
        <span className={cn('inline-flex items-center gap-1 text-xs', v > 0 ? 'text-foreground' : 'text-amber-600')}>
          <Paperclip className="h-3.5 w-3.5" /> {v || 0}
        </span>
      )
    case 'project':
      return row.project ? (
        <Link href={`/projects/${row.project.id}`} className="text-primary hover:underline whitespace-nowrap text-xs font-medium" onClick={(e) => e.stopPropagation()}>
          {row.project.projectId}
          <span className="block text-[11px] text-muted-foreground font-normal truncate max-w-[160px]">{row.project.projectName}</span>
        </Link>
      ) : <span className="text-muted-foreground">-</span>
    case 'qty':
      return <span className="tabular whitespace-nowrap">{formatNumber(v)} {row.unit || ''}</span>
    case 'progress':
      return (
        <div className="min-w-[110px]">
          <div className="flex justify-between text-[11px] mb-1 tabular"><span>{formatNumber(row.deliveredQty)} / {formatNumber(row.quantity)} {row.unit}</span><span>{v || 0}%</span></div>
          <Progress value={v || 0} className="h-1.5" />
        </div>
      )
    case 'route':
      return <span className="text-xs whitespace-nowrap">{row.origin || '-'} <ArrowRight className="inline h-3 w-3 mx-0.5 text-muted-foreground" /> {row.destination || '-'}</span>
    default:
      return <span className={cn(col.truncate && 'block max-w-[220px] truncate', col.primary && 'font-medium text-foreground')} title={typeof v === 'string' ? v : undefined}>{v ?? '-'}</span>
  }
}

function detailValue(key, v, row = {}) {
  if (key === 'sourceDisplay') {
    if (row?.source === 'Approach' || row?.approachId) {
      return `Approach (${row.approachId || '-'})`
    }
    return 'Direct Penawaran'
  }
  if (key === 'approachId') {
    return row?.approachId || '-'
  }
  if (v === undefined || v === null || v === '') return '-'
  if (CURRENCY_FIELDS.has(key)) return formatIDR(v)
  if (DATE_FIELDS.has(key)) return formatDate(v)
  if (PCT_FIELDS.has(key)) return formatPct(v)
  if (QTY_FIELDS.has(key)) return `${formatNumber(v)} ${row.unit || ''}`
  return String(v)
}

// ---------------------------------------------------------------------------
// Table & cards
// ---------------------------------------------------------------------------
export function RecordTable({ config, items, onRowClick, compact = false }) {
  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {config.columns.map((c) => (
                <TableHead key={c.key} className={cn('text-xs font-semibold text-muted-foreground whitespace-nowrap', compact && 'h-9')}>{c.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => (
              <TableRow key={row.id} className="cursor-pointer" onClick={() => onRowClick && onRowClick(row)}>
                {config.columns.map((c) => (
                  <TableCell key={c.key} className={cn('text-sm py-2.5', compact && 'py-2')}><CellValue col={c} row={row} /></TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export function RecordCards({ config, items, onRowClick }) {
  const m = config.mobile || {}
  return (
    <div className="grid gap-3">
      {items.map((row) => {
        const subtitle = m.subtitle === 'route' ? `${row.origin || '-'} → ${row.destination || '-'}` : row[m.subtitle]
        return (
          <Card key={row.id} className="p-4 rounded-2xl shadow-sm active:bg-muted/40" onClick={() => onRowClick && onRowClick(row)}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{row[m.title]}</p>
                {subtitle && <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>}
                {row.project && <p className="text-[11px] text-primary mt-0.5">{row.project.projectId}</p>}
              </div>
              <StatusBadge status={row.status || row.businessLine} />
            </div>
            {m.value && (
              <div className="mt-2.5 flex items-baseline justify-between">
                <span className="text-xs text-muted-foreground">{m.valueLabel || 'Nilai'}</span>
                <span className="font-semibold tabular">{formatIDR(row[m.value])}</span>
              </div>
            )}
            {m.progress && (
              <div className="mt-2.5">
                <div className="flex justify-between text-[11px] mb-1 tabular"><span>{formatNumber(row.deliveredQty)} / {formatNumber(row.quantity)} {row.unit}</span><span>{row[m.progress] || 0}%</span></div>
                <Progress value={row[m.progress] || 0} className="h-1.5" />
              </div>
            )}
            <div className="mt-2.5 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              {(m.meta || []).map((k) => {
                if (k === 'qtyUnit') return <span key={k}>{formatNumber(row.qty)} {row.unit}</span>
                if (k === 'qtyUnitStock') return <span key={k}>{formatNumber(row.currentStock)} {row.unit}</span>
                if (DATE_FIELDS.has(k)) return <span key={k}>{formatDate(row[k])}</span>
                return row[k] ? <span key={k} className="truncate max-w-[180px]">{row[k]}</span> : null
              })}
              <span className={cn('ml-auto inline-flex items-center gap-1', !row.docCount && 'text-amber-600')}><Paperclip className="h-3 w-3" />{row.docCount || 0}</span>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------
function SmartSelect({ value, onChange, options = [], placeholder, allowCustom, name }) {
  if (allowCustom) {
    const listId = `dl-${name}`
    return (
      <>
        <Input list={listId} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || 'Ketik atau pilih'} />
        <datalist id={listId}>{options.map((o) => <option key={o} value={o} />)}</datalist>
      </>
    )
  }
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
      <SelectTrigger><SelectValue placeholder={placeholder || 'Pilih'} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}><span className="text-muted-foreground">-</span></SelectItem>
        {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

export function RecordForm({ config, initial = {}, meta, onSaved, onCancel, lockProject = false }) {
  const isEdit = !!initial?.id
  const [quotationSource, setQuotationSource] = useState(() => initial?.source || (initial?.approachId ? 'Approach' : 'Direct'))
  const [values, setValues] = useState(() => {
    const base = {}
    config.sections.forEach((s) => s.fields.forEach((f) => { if (f.type !== 'computed') base[f.name] = initial?.[f.name] ?? '' }))
    if (!isEdit && config.defaultStatus && !base.status) base.status = config.defaultStatus
    if (initial?.projectId) base.projectId = initial.projectId
    if (config.key === 'quotations') {
      base.source = initial?.source || (initial?.approachId ? 'Approach' : 'Direct')
      base.approachId = initial?.approachId || ''
    }
    return base
  })
  const [pending, setPending] = useState([])
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(null)

  const projects = meta?.projects || []
  const pos = meta?.pos || []
  const settings = meta?.settings || {}
  const optionsFor = (f) => {
    if (f.options) return f.options
    if (f.optionsFrom === 'businessLines') return settings.businessLines || ['Trading', 'Logistics']
    if (f.optionsFrom === 'units') return settings.units || []
    if (f.optionsFrom === 'salesPics') return meta?.salesPics || []
    if (f.optionsFrom === 'customers') return meta?.customers || []
    if (f.optionsFrom === 'vendors') return meta?.vendors || []
    return []
  }

  const isQuotation = config.key === 'quotations'
  const { data: appData } = useSWR(isQuotation ? '/api/approaches?limit=200' : null, fetcher)
  const approaches = appData?.items || []

  const hasSchedule = config.sections.some((s) => s.fields.some((f) => f.type === 'schedule'))
  const { data: schedData } = useSWR(hasSchedule ? (values.projectId ? `/api/schedules?projectId=${values.projectId}&limit=200` : '/api/schedules?limit=200') : null, fetcher)
  const schedules = schedData?.items || []

  const hasBast = config.sections.some((s) => s.fields.some((f) => f.type === 'bast'))
  const { data: bastData } = useSWR(hasBast ? (values.projectId ? `/api/basts?projectId=${values.projectId}&limit=200` : '/api/basts?limit=200') : null, fetcher)
  const basts = bastData?.items || []

  const hasQuotation = config.sections.some((s) => s.fields.some((f) => f.type === 'quotation'))
  const { data: quotData } = useSWR(hasQuotation ? (values.projectId ? `/api/quotations?projectId=${values.projectId}&limit=200` : '/api/quotations?limit=200') : null, fetcher)
  const quotations = quotData?.items || []

  const set = (name, v) => setValues((prev) => ({ ...prev, [name]: v }))

  const onApproachChange = (apId) => {
    const ap = approaches.find((x) => x.id === apId)
    if (ap) {
      setValues((prev) => ({
        ...prev,
        approachId: apId,
        source: 'Approach',
        sourceDisplay: `Approach (${apId})`,
        customer: ap.companyName || prev.customer || '',
        customerPic: ap.customerPic || prev.customerPic || '',
        salesPic: ap.salesPic || prev.salesPic || '',
        businessLine: ap.businessLine || prev.businessLine || '',
        projectName: ap.opportunity || prev.projectName || '',
        projectId: ap.projectId || prev.projectId || '',
      }))
    } else {
      setValues((prev) => ({ ...prev, approachId: '', source: 'Direct', sourceDisplay: 'Direct Penawaran' }))
    }
  }

  const onProjectChange = (pid) => {
    const p = projects.find((x) => x.id === pid)
    setValues((prev) => {
      const next = { ...prev, projectId: pid === NEW_PROJECT ? '' : pid }
      if (p) {
        if ('customer' in next && !prev.customer) next.customer = p.customer
        if ('businessLine' in next && !prev.businessLine) next.businessLine = p.businessLine
        if ('salesPic' in next && !prev.salesPic) next.salesPic = p.salesPic
        if ('projectName' in next && !prev.projectName) next.projectName = p.projectName
        if ('unit' in next && !prev.unit && p.unit) next.unit = p.unit
        if ('poId' in next && prev.projectId !== pid) next.poId = ''
        if ('quotationId' in next && prev.projectId !== pid) next.quotationId = ''
        if ('bastId' in next && prev.projectId !== pid) next.bastId = ''
        if ('deliveryRef' in next && prev.projectId !== pid) next.deliveryRef = ''
      }
      return next
    })
  }

  const onQuotationChange = (qid) => {
    const q = quotations.find((x) => x.id === qid)
    setValues((prev) => ({
      ...prev,
      quotationId: qid,
      quotationNumber: q?.quotationNumber || prev.quotationNumber || '',
      customer: prev.customer || q?.customer || '',
      salesPic: prev.salesPic || q?.salesPic || '',
      businessLine: prev.businessLine || q?.businessLine || '',
      poValue: prev.poValue || q?.revenue || '',
      hppFinal: prev.hppFinal || q?.hpp || '',
      unit: prev.unit || q?.unit || '',
      projectId: prev.projectId || q?.projectId || '',
    }))
  }

  const onPoChange = (poId) => {
    const po = pos.find((x) => x.id === poId)
    setValues((prev) => ({
      ...prev,
      poId,
      poNumber: po?.poNumber || prev.poNumber || '',
      unit: prev.unit || po?.unit || '',
      customer: prev.customer || po?.customer || '',
      projectId: po?.projectId || prev.projectId || '',
      deliveryRef: prev.poId !== poId ? '' : prev.deliveryRef,
      bastId: prev.poId !== poId ? '' : prev.bastId,
    }))
  }

  const onScheduleChange = (sid) => {
    const s = schedules.find((x) => x.id === sid)
    if (s) {
      const delivered = s.actualDeliveredQty !== null && s.actualDeliveredQty !== undefined ? Number(s.actualDeliveredQty) : (s.status === 'Delivered' ? Number(s.qty) : 0)
      const remaining = s.remainingUnbastedQty !== undefined ? s.remainingUnbastedQty : delivered
      setValues((prev) => ({
        ...prev,
        deliveryRef: sid,
        poId: s.poId || prev.poId,
        deliveryNumber: s.deliveryNumber || '',
        qty: remaining > 0 ? remaining : prev.qty || '',
        unit: s.unit || prev.unit || '',
        projectId: s.projectId || prev.projectId || '',
      }))
    }
  }

  const onBastChange = (bid) => {
    const b = basts.find((x) => x.id === bid)
    if (b) {
      const remaining = b.remainingInvoiceableQty !== undefined ? b.remainingInvoiceableQty : Number(b.qty)
      const matchingPo = pos.find((p) => p.id === b.poId)
      setValues((prev) => ({
        ...prev,
        bastId: bid,
        bastNumber: b.bastNumber || prev.bastNumber || '',
        poId: b.poId || prev.poId,
        quantity: remaining > 0 ? remaining : prev.quantity || '',
        unit: b.unit || prev.unit || '',
        customer: prev.customer || matchingPo?.customer || b.customer || '',
        projectId: b.projectId || prev.projectId || '',
      }))
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    // Required fields check
    for (const s of config.sections) for (const f of s.fields) {
      if (f.required && (values[f.name] === '' || values[f.name] === undefined || values[f.name] === null)) {
        toast.error(`${f.label} wajib diisi`)
        return
      }
    }
    // Date validation: Actual/transaction date cannot exceed today
    for (const s of config.sections) for (const f of s.fields) {
      if (f.type === 'date' && ACTUAL_DATE_FIELDS.has(f.name) && values[f.name]) {
        if (values[f.name] > todayISO()) {
          toast.error('Tanggal tidak boleh melebihi hari ini.')
          return
        }
      }
    }

    // Global quantity validation: All entered quantity fields must be > 0
    if (config.key === 'pos') {
      if (Number(values.quantity) <= 0) {
        toast.error('Qty harus lebih besar dari 0.')
        return
      }
    }
    if (config.key === 'schedules') {
      const planned = values.plannedQty !== undefined && values.plannedQty !== '' ? values.plannedQty : values.qty
      if (Number(planned) <= 0) {
        toast.error('Qty harus lebih besar dari 0.')
        return
      }
      if (values.actualDeliveredQty !== undefined && values.actualDeliveredQty !== null && values.actualDeliveredQty !== '') {
        if (Number(values.actualDeliveredQty) <= 0) {
          toast.error('Qty harus lebih besar dari 0.')
          return
        }
      }
    }
    if (config.key === 'basts') {
      const bastQty = Number(values.qty)
      if (bastQty <= 0) {
        toast.error('Qty harus lebih besar dari 0.')
        return
      }
      const selSched = schedules.find((s) => s.id === values.deliveryRef)
      if (selSched) {
        const delivered = selSched.actualDeliveredQty !== null && selSched.actualDeliveredQty !== undefined ? Number(selSched.actualDeliveredQty) : (selSched.status === 'Delivered' ? Number(selSched.qty) : 0)
        const remaining = selSched.remainingUnbastedQty !== undefined ? selSched.remainingUnbastedQty : delivered
        if (bastQty > remaining) {
          toast.error(`Qty BAST melebihi sisa quantity pengiriman yang belum dibuatkan BAST. Sisa: ${remaining} ${selSched.unit || ''}`.trim())
          return
        }
      }
    }
    if (config.key === 'invoices-out') {
      const invQty = Number(values.quantity)
      if (invQty <= 0) {
        toast.error('Qty harus lebih besar dari 0.')
        return
      }
      const selBast = basts.find((b) => b.id === values.bastId)
      if (selBast) {
        const remaining = selBast.remainingInvoiceableQty !== undefined ? selBast.remainingInvoiceableQty : Number(selBast.qty)
        if (invQty > remaining) {
          toast.error(`Qty invoice melebihi sisa quantity BAST yang belum ditagihkan. Sisa: ${remaining} ${selBast.unit || ''}`.trim())
          return
        }
      }
    }
    if (config.key === 'stocks') {
      if (Number(values.currentStock) <= 0) {
        toast.error('Qty harus lebih besar dari 0.')
        return
      }
    }

    setSaving(true)
    try {
      const payload = { ...values }
      if (payload.poId) payload.poNumber = pos.find((x) => x.id === payload.poId)?.poNumber || payload.poNumber
      if (payload.quotationId) payload.quotationNumber = quotations.find((x) => x.id === payload.quotationId)?.quotationNumber || payload.quotationNumber
      if (payload.bastId) payload.bastNumber = basts.find((x) => x.id === payload.bastId)?.bastNumber || payload.bastNumber
      if (config.key === 'quotations') {
        payload.source = quotationSource
        if (quotationSource === 'Direct') payload.approachId = null
      }
      const saved = isEdit ? await api(`/api/${config.key}/${initial.id}`, { method: 'PUT', body: payload }) : await api(`/api/${config.key}`, { method: 'POST', body: payload })
      if (pending.length) {
        for (let i = 0; i < pending.length; i++) {
          setProgress({ name: pending[i].name, pct: 0, idx: i + 1, total: pending.length })
          await uploadFile({ file: pending[i], entityType: config.key, entityId: saved.id, projectId: saved.projectId, category: config.docCategory, onProgress: (p) => setProgress((x) => ({ ...x, pct: p })) })
        }
      }
      toast.success(isEdit ? 'Perubahan tersimpan' : `${config.title} berhasil ditambahkan`)
      onSaved && onSaved(saved)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
      setProgress(null)
    }
  }

  const renderField = (f) => {
    const v = values[f.name]
    const common = { id: f.name }
    switch (f.type) {
      case 'computed': {
        const val = f.compute(values)
        return <div className="h-10 flex items-center rounded-md border bg-muted/50 px-3 text-sm font-semibold tabular">{f.format === 'currency' ? formatIDR(val) : f.format === 'percent' ? formatPct(val) : val}</div>
      }
      case 'currency':
        return <CurrencyInput {...common} value={v} onChange={(x) => set(f.name, x)} />
      case 'number':
        return <Input {...common} type="number" inputMode="decimal" value={v} onChange={(e) => set(f.name, e.target.value)} className="tabular" />
      case 'date': {
        const isActual = ACTUAL_DATE_FIELDS.has(f.name)
        const isFutureInvalid = isActual && Boolean(v && v > todayISO())
        return (
          <div className="space-y-1">
            <Input
              {...common}
              type="date"
              value={v || ''}
              max={isActual ? todayISO() : undefined}
              onChange={(e) => set(f.name, e.target.value)}
              className={cn(isFutureInvalid && 'border-red-500 focus-visible:ring-red-500')}
            />
            {isFutureInvalid && (
              <p className="text-[11px] text-red-600 font-medium">Tanggal tidak boleh melebihi hari ini.</p>
            )}
          </div>
        )
      }
      case 'textarea':
        return <Textarea {...common} rows={2} value={v || ''} onChange={(e) => set(f.name, e.target.value)} />
      case 'status':
        return (
          <Select value={v || NONE} onValueChange={(x) => set(f.name, x === NONE ? '' : x)}>
            <SelectTrigger id={f.name}><SelectValue placeholder="Pilih status" /></SelectTrigger>
            <SelectContent>{config.statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        )
      case 'select':
        return <SmartSelect name={f.name} value={v} onChange={(x) => set(f.name, x)} options={optionsFor(f)} allowCustom={f.allowCustom} />
      case 'project':
        return (
          <Select value={v || (config.allowNewProject ? NEW_PROJECT : NONE)} onValueChange={onProjectChange} disabled={lockProject}>
            <SelectTrigger id={f.name}><SelectValue placeholder="Pilih project" /></SelectTrigger>
            <SelectContent className="max-h-72">
              {config.allowNewProject ? <SelectItem value={NEW_PROJECT}><span className="text-primary font-medium">+ Buat project baru otomatis</span></SelectItem> : <SelectItem value={NONE}><span className="text-muted-foreground">-</span></SelectItem>}
              {projects.map((p) => <SelectItem key={p.id} value={p.id}><span className="font-medium">{p.projectId}</span> · {p.customer} · <span className="text-muted-foreground">{p.projectName}</span></SelectItem>)}
            </SelectContent>
          </Select>
        )
      case 'quotation': {
        const list = quotations.filter((q) => !values.projectId || q.projectId === values.projectId)
        return (
          <Select value={v || NONE} onValueChange={(x) => onQuotationChange(x === NONE ? '' : x)}>
            <SelectTrigger id={f.name}><SelectValue placeholder={values.projectId ? 'Pilih penawaran' : 'Pilih penawaran'} /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={NONE}><span className="text-muted-foreground">-</span></SelectItem>
              {list.map((q) => (
                <SelectItem key={q.id} value={q.id}>
                  <span className="font-medium">{q.quotationNumber}</span> · {q.customer} · {formatCompact(q.revenue, false)} ({q.status})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      }
      case 'po': {
        const list = pos.filter((p) => !values.projectId || p.projectId === values.projectId)
        return (
          <Select value={v || NONE} onValueChange={(x) => onPoChange(x === NONE ? '' : x)}>
            <SelectTrigger id={f.name}><SelectValue placeholder={values.projectId ? 'Pilih PO Masuk' : 'Pilih project dulu'} /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={NONE}><span className="text-muted-foreground">-</span></SelectItem>
              {list.map((p) => <SelectItem key={p.id} value={p.id}>{p.poNumber} · {p.customer ? `${p.customer} · ` : ''}{formatNumber(p.quantity)} {p.unit}</SelectItem>)}
            </SelectContent>
          </Select>
        )
      }
      case 'schedule': {
        const eligibleSchedules = schedules.filter((s) => {
          if (values.poId && s.poId !== values.poId) return false
          if (!values.poId && values.projectId && s.projectId !== values.projectId) return false
          const delivered = s.actualDeliveredQty !== null && s.actualDeliveredQty !== undefined ? Number(s.actualDeliveredQty) : (s.status === 'Delivered' ? Number(s.qty) : 0)
          return delivered > 0 && ['Partial Delivered', 'Delivered', 'Partial'].includes(s.status)
        })
        return (
          <Select value={v || NONE} onValueChange={(x) => onScheduleChange(x === NONE ? '' : x)}>
            <SelectTrigger id={f.name}><SelectValue placeholder={values.poId ? (eligibleSchedules.length ? 'Pilih schedule dengan realisasi pengiriman' : 'Tidak ada schedule ber-realisasi pengiriman') : 'Pilih PO Masuk dulu'} /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={NONE}><span className="text-muted-foreground">-</span></SelectItem>
              {eligibleSchedules.map((s) => {
                const delivered = s.actualDeliveredQty !== null && s.actualDeliveredQty !== undefined ? Number(s.actualDeliveredQty) : Number(s.qty)
                const remaining = s.remainingUnbastedQty !== undefined ? s.remainingUnbastedQty : delivered
                return (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="font-medium">{s.deliveryNumber}</span> · Realisasi: {formatNumber(delivered)} {s.unit} (Sisa: {formatNumber(remaining)}) · {s.status}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        )
      }
      case 'bast': {
        const eligibleBasts = basts.filter((b) => {
          if (values.poId && b.poId !== values.poId) return false
          if (!values.poId && values.projectId && b.projectId !== values.projectId) return false
          const remaining = b.remainingInvoiceableQty !== undefined ? b.remainingInvoiceableQty : Number(b.qty)
          return Number(b.qty) > 0 && remaining > 0 && ['Partial', 'Complete', 'Verified'].includes(b.status)
        })
        return (
          <Select value={v || NONE} onValueChange={(x) => onBastChange(x === NONE ? '' : x)}>
            <SelectTrigger id={f.name}><SelectValue placeholder={values.poId ? (eligibleBasts.length ? 'Pilih BAST (Hanya BAST verified / complete)' : 'Tidak ada BAST yang dapat ditagih') : 'Pilih PO Masuk dulu'} /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={NONE}><span className="text-muted-foreground">-</span></SelectItem>
              {eligibleBasts.map((b) => {
                const remaining = b.remainingInvoiceableQty !== undefined ? b.remainingInvoiceableQty : Number(b.qty)
                return (
                  <SelectItem key={b.id} value={b.id}>
                    <span className="font-medium">{b.bastNumber}</span> · Sisa Tagih: {formatNumber(remaining)} {b.unit || ''} ({b.status})
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        )
      }
      default:
        return <Input {...common} value={v || ''} onChange={(e) => set(f.name, e.target.value)} />
    }
  }

  return (
    <form id="record-form" onSubmit={submit} className="space-y-6">
      {/* Choice for Penawaran Creation: Option A (Dari Approach) vs Option B (Buat Langsung) */}
      {isQuotation && !isEdit && (
        <div className="rounded-xl border bg-muted/40 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sumber Penawaran</span>
            <span className="text-[11px] text-muted-foreground">Pilih cara pembuatan</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setQuotationSource('Approach')
                set('source', 'Approach')
              }}
              className={cn(
                'h-9 rounded-lg text-xs font-medium border transition-all',
                quotationSource === 'Approach'
                  ? 'bg-primary text-white border-primary shadow-sm'
                  : 'bg-card text-muted-foreground hover:bg-muted'
              )}
            >
              1. Dari Approach
            </button>
            <button
              type="button"
              onClick={() => {
                setQuotationSource('Direct')
                set('source', 'Direct')
                set('approachId', null)
              }}
              className={cn(
                'h-9 rounded-lg text-xs font-medium border transition-all',
                quotationSource === 'Direct'
                  ? 'bg-primary text-white border-primary shadow-sm'
                  : 'bg-card text-muted-foreground hover:bg-muted'
              )}
            >
              2. Buat Langsung
            </button>
          </div>
          {quotationSource === 'Approach' && (
            <div className="space-y-1 pt-1">
              <Label htmlFor="approachSelector" className="text-xs">Pilih Approach Reference <span className="text-red-500">*</span></Label>
              <Select value={values.approachId || NONE} onValueChange={(v) => onApproachChange(v === NONE ? '' : v)}>
                <SelectTrigger id="approachSelector" className="bg-card">
                  <SelectValue placeholder="Pilih lead approach yang akan diajukan penawaran" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={NONE}><span className="text-muted-foreground">-</span></SelectItem>
                  {approaches.filter((a) => a.status !== 'Lost').map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="font-medium">{a.companyName}</span> · {a.opportunity} ({a.salesPic || '-'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Data Customer, PIC, Sales PIC, Business Line, & Nama Project akan terisi otomatis.</p>
            </div>
          )}
          {quotationSource === 'Direct' && (
            <p className="text-[11px] text-muted-foreground">Penawaran langsung tanpa Approach. Isi data customer dan project secara manual pada form di bawah.</p>
          )}
        </div>
      )}

      {config.sections.map((s, i) => (
        <section key={s.title} className="space-y-3">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{i + 1}. {s.title}</h4>
            {s.description && <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {s.fields.map((f) => (
              <div key={f.name} className={cn('space-y-1.5', f.full && 'sm:col-span-2')}>
                <Label htmlFor={f.name} className="text-xs">{f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}</Label>
                {renderField(f)}
                {f.helper && <p className="text-[11px] text-muted-foreground">{f.helper}</p>}
              </div>
            ))}
          </div>
        </section>
      ))}

      {!isEdit && (
        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{config.sections.length + 1}. Attachment</h4>
          <label className="block cursor-pointer rounded-xl border-2 border-dashed p-4 text-center bg-muted/40 hover:bg-muted/70">
            <FileUp className="h-5 w-5 mx-auto text-primary mb-1" />
            <span className="text-sm font-medium">Pilih file dokumen</span>
            <span className="block text-xs text-muted-foreground">Diupload otomatis setelah disimpan · PDF, Excel, Word, gambar, ZIP</span>
            <input type="file" multiple className="hidden" onChange={(e) => { setPending((p) => [...p, ...Array.from(e.target.files || [])]); e.target.value = '' }} />
          </label>
          {pending.length > 0 && (
            <div className="divide-y rounded-lg border">
              {pending.map((f, i) => {
                const { Icon, cls } = fileIcon(f.type, f.name)
                return (
                  <div key={i} className="flex items-center gap-2 p-2 text-xs">
                    <span className={cn('h-7 w-7 rounded-md grid place-items-center', cls)}><Icon className="h-3.5 w-3.5" /></span>
                    <span className="truncate flex-1">{f.name}</span>
                    <button type="button" onClick={() => setPending((p) => p.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                  </div>
                )
              })}
            </div>
          )}
          {progress && (
            <div className="text-xs">
              <div className="flex justify-between mb-1"><span>Upload {progress.idx}/{progress.total}: {progress.name}</span><span>{progress.pct}%</span></div>
              <Progress value={progress.pct} className="h-1.5" />
            </div>
          )}
        </section>
      )}

      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Batal</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
      </div>
    </form>
  )
}

export function RecordFormDrawer({ config, open, onOpenChange, initial, meta, onSaved, lockProject }) {
  if (!config) return null
  return (
    <ResponsiveDrawer open={open} onOpenChange={onOpenChange} title={initial?.id ? `Edit ${config.title}` : config.cta} description={config.subtitle} wide>
      {open && <RecordForm key={initial?.id || 'new'} config={config} initial={initial || {}} meta={meta} onSaved={onSaved} onCancel={() => onOpenChange(false)} lockProject={lockProject} />}
    </ResponsiveDrawer>
  )
}

// ---------------------------------------------------------------------------
// Detail drawer
// ---------------------------------------------------------------------------
export function RecordDetailDrawer({ config, record, open, onOpenChange, onEdit, onChanged, onAction, meta }) {
  const { user } = useAuth()
  const [confirmDel, setConfirmDel] = useState(false)
  const [busy, setBusy] = useState(false)
  const writable = canWrite(user, config.key)
  if (!record) return null

  const changeStatus = async (status) => {
    setBusy(true)
    try {
      await api(`/api/${config.key}/${record.id}`, { method: 'PUT', body: { status } })
      toast.success(`Status → ${status}`)
      onChanged && onChanged()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  const remove = async () => {
    setBusy(true)
    try {
      await api(`/api/${config.key}/${record.id}`, { method: 'DELETE' })
      toast.success('Data dihapus')
      setConfirmDel(false)
      onOpenChange(false)
      onChanged && onChanged()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const title = record[config.titleField] || config.title
  const actions = (config.actions || []).filter((a) => !a.when || a.when(record))

  return (
    <ResponsiveDrawer open={open} onOpenChange={onOpenChange} title={title} description={config.title}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {record.status && <StatusBadge status={record.status} size="md" />}
          {record.businessLine && <StatusBadge status={record.businessLine} size="md" />}
          {record.project && (
            <Link href={`/projects/${record.project.id}`} className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <FolderOpen className="h-3.5 w-3.5" /> {record.project.projectId}
            </Link>
          )}
        </div>

        {writable && config.statuses?.length > 0 && (
          <div className="flex items-center gap-2">
            <Label className="text-xs shrink-0">Update status</Label>
            <Select value={record.status} onValueChange={changeStatus} disabled={busy}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{config.statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border bg-muted/30 p-4">
          {record.project && (
            <div className="col-span-2"><dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Project</dt><dd className="text-sm font-medium">{record.project.projectId} · {record.project.projectName}</dd></div>
          )}
          {config.detailFields.map((k) => (
            <div key={k} className={cn(k === 'notes' && 'col-span-2')}>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{FIELD_LABELS[k] || k}</dt>
              <dd className={cn('text-sm', (CURRENCY_FIELDS.has(k) || QTY_FIELDS.has(k)) && 'tabular font-medium')}>{detailValue(k, record[k], record)}</dd>
            </div>
          ))}
        </dl>

        {(writable || actions.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {writable && <Button size="sm" variant="outline" onClick={() => onEdit(record)}><Pencil className="h-3.5 w-3.5 mr-1.5" />Edit</Button>}
            {actions.map((a) => (
              <Button key={a.id} size="sm" onClick={() => onAction && onAction(a.id, record)}>{a.label}<ArrowRight className="h-3.5 w-3.5 ml-1.5" /></Button>
            ))}
            {writable && <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 ml-auto" onClick={() => setConfirmDel(true)}><Trash2 className="h-3.5 w-3.5 mr-1.5" />Hapus</Button>}
          </div>
        )}

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Dokumen</h4>
          <RecordDocuments entityType={config.key} entityId={record.id} projectId={record.projectId} category={config.docCategory} categories={meta?.settings?.documentCategories} canEdit={writable || (user && user.role !== 'management')} hint={config.docHint} />
        </div>
      </div>

      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {config.title}?</AlertDialogTitle>
            <AlertDialogDescription>“{title}” beserta dokumennya akan dihapus permanen.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={remove} className="bg-red-600 hover:bg-red-700">Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ResponsiveDrawer>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
export function EmptyState({ title, text, cta, onCta, icon: Icon = FolderOpen }) {
  return (
    <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
      <span className="mx-auto h-12 w-12 rounded-2xl bg-primary/10 text-primary grid place-items-center mb-3"><Icon className="h-6 w-6" /></span>
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">{text}</p>
      {cta && onCta && <Button className="mt-4" onClick={onCta}><Plus className="h-4 w-4 mr-1.5" />{cta}</Button>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stage page
// ---------------------------------------------------------------------------
const FILTER_LABELS = { noDoc: 'Belum upload file', noSchedule: 'PO tanpa schedule', overdue: 'Overdue', dueSoon: 'Jatuh tempo 7 hari', missing: 'Belum ada BAST', stale: 'Belum update' }

export function StagePage({ stageKey }) {
  const config = STAGES[stageKey]
  const router = useRouter()
  const sp = useSearchParams()
  const { user } = useAuth()
  const writable = canWrite(user, config.key)

  const [search, setSearch] = useState(sp.get('q') || '')
  const [q, setQ] = useState(sp.get('q') || '')
  const [status, setStatus] = useState(sp.get('status') || '')
  const [bl, setBl] = useState(sp.get('businessLine') || '')
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)
  const filter = sp.get('filter') || ''

  useEffect(() => { const t = setTimeout(() => setQ(search), 300); return () => clearTimeout(t) }, [search])
  useEffect(() => { setPage(1) }, [q, status, bl, filter])

  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (status) params.set('status', status)
  if (bl) params.set('businessLine', bl)
  if (filter) params.set('filter', filter)
  params.set('page', String(page))
  params.set('limit', '20')
  const listKey = `/api/${config.key}?${params.toString()}`
  const { data, isLoading, mutate } = useSWR(listKey, fetcher)
  const { data: meta } = useSWR('/api/meta', fetcher)

  const [detail, setDetail] = useState(null)
  const [form, setForm] = useState(null) // { config, initial, after }

  useEffect(() => {
    if (sp.get('new') === '1' && writable) setForm({ config, initial: {} })
  }, [sp, writable]) // eslint-disable-line react-hooks/exhaustive-deps

  const items = data?.items || []
  const total = data?.total || 0
  const pages = Math.max(1, Math.ceil(total / 20))

  const clearFilter = () => router.replace(config.path)

  const handleAction = async (actionId, record) => {
    try {
      if (actionId === 'convert') {
        const res = await api(`/api/approaches/${record.id}/convert`, { method: 'POST' })
        setDetail(null)
        setForm({ config: STAGES.quotations, initial: res.prefill, after: () => router.push('/penawaran') })
      }
      if (actionId === 'convert-po') {
        const res = await api(`/api/quotations/${record.id}/convert-po`, { method: 'POST' })
        setDetail(null)
        setForm({ config: STAGES.pos, initial: res.prefill, after: () => router.push('/po') })
      }
    } catch (e) { toast.error(e.message) }
  }

  const pendingSchedules = data?.pendingSchedules || []

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">{config.title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{config.subtitle}</p>
        </div>
        {writable && (
          <Button className="hidden md:inline-flex" onClick={() => setForm({ config, initial: {} })}><Plus className="h-4 w-4 mr-1.5" />{config.cta}</Button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Cari ${config.title.toLowerCase()}...`} className="pl-9 bg-card" />
        </div>
        <Button variant="outline" className="md:hidden" onClick={() => setShowFilters((s) => !s)}><Filter className="h-4 w-4 mr-1.5" />Filter</Button>
        <div className={cn('flex gap-2 flex-wrap', showFilters ? 'flex' : 'hidden md:flex')}>
          {config.filters.includes('status') && config.statuses.length > 0 && (
            <Select value={status || NONE} onValueChange={(v) => setStatus(v === NONE ? '' : v)}>
              <SelectTrigger className="w-full md:w-40 bg-card"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>Semua status</SelectItem>{config.statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {config.filters.includes('businessLine') && (
            <Select value={bl || NONE} onValueChange={(v) => setBl(v === NONE ? '' : v)}>
              <SelectTrigger className="w-full md:w-40 bg-card"><SelectValue placeholder="Business Line" /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>Semua BL</SelectItem>{(meta?.settings?.businessLines || ['Trading', 'Logistics']).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {filter && (
            <Button variant="secondary" size="sm" className="h-10" onClick={clearFilter}>{FILTER_LABELS[filter] || filter}<X className="h-3.5 w-3.5 ml-1.5" /></Button>
          )}
        </div>
      </div>

      {/* BAST missing banner */}
      {filter === 'missing' && pendingSchedules.length > 0 && (
        <Card className="p-4 rounded-2xl border-amber-200 bg-amber-50/60">
          <p className="text-sm font-medium text-amber-800 mb-2">{pendingSchedules.length} pengiriman selesai belum ada BAST</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {pendingSchedules.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-card border p-2.5 text-sm">
                <div className="min-w-0"><p className="font-medium truncate">{s.deliveryNumber}</p><p className="text-xs text-muted-foreground">{formatNumber(s.qty)} {s.unit} · {formatDate(s.actualDate || s.scheduleDate)}</p></div>
                {writable && <Button size="sm" onClick={() => setForm({ config, initial: { projectId: s.projectId, poId: s.poId, deliveryRef: s.id, deliveryNumber: s.deliveryNumber, qty: s.qty, unit: s.unit } })}>Upload BAST</Button>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
      ) : items.length === 0 ? (
        filter === 'missing' && pendingSchedules.length > 0 ? null : (
          <EmptyState title={q || status || filter ? 'Tidak ada data yang cocok.' : config.emptyTitle} text={q || status || filter ? 'Coba ubah kata kunci atau filter.' : config.emptyText} cta={writable && !q && !status && !filter ? config.cta : null} onCta={() => setForm({ config, initial: {} })} />
        )
      ) : (
        <>
          <div className="hidden md:block"><RecordTable config={config} items={items} onRowClick={setDetail} /></div>
          <div className="md:hidden"><RecordCards config={config} items={items} onRowClick={setDetail} /></div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{total} data</span>
            {pages > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="px-2">{page} / {pages}</span>
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Mobile sticky CTA */}
      {writable && (
        <div className="md:hidden fixed bottom-[68px] inset-x-0 px-4 z-30 pointer-events-none">
          <Button className="w-full shadow-lg pointer-events-auto h-11" onClick={() => setForm({ config, initial: {} })}><Plus className="h-4 w-4 mr-1.5" />{config.cta}</Button>
        </div>
      )}

      <RecordDetailDrawer
        config={config}
        record={detail}
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        onEdit={(r) => { setDetail(null); setForm({ config, initial: r }) }}
        onChanged={() => mutate()}
        onAction={handleAction}
        meta={meta}
      />
      <RecordFormDrawer
        config={form?.config}
        open={!!form}
        onOpenChange={(o) => !o && setForm(null)}
        initial={form?.initial}
        meta={meta}
        onSaved={() => { const after = form?.after; setForm(null); mutate(); after && after() }}
      />
    </div>
  )
}

export default StagePage
