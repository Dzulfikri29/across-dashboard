'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Paperclip, Check, FileText, Clock } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusBadge } from '@/components/across/status-badge'
import { RecordTable, RecordCards, RecordFormDrawer, RecordDetailDrawer, EmptyState } from '@/components/across/stage-page'
import { AttachmentList, DocumentUploader } from '@/components/across/documents'
import { useAuth } from '@/components/across/auth-context'
import { STAGES } from '@/lib/stage-config'
import { api, fetcher, canWrite, formatIDR, formatCompact, formatPct, formatNumber, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

const STAGE_ORDER = ['Approach', 'Penawaran', 'PO', 'Schedule', 'BAST', 'Invoice In', 'Invoice Out', 'Closed']
const TABS = [
  { key: 'quotations', label: 'Penawaran', dataKey: 'quotations' },
  { key: 'pos', label: 'PO', dataKey: 'pos' },
  { key: 'schedules', label: 'Schedule', dataKey: 'schedules' },
  { key: 'basts', label: 'BAST', dataKey: 'basts' },
  { key: 'invoices-in', label: 'Invoice In', dataKey: 'invoicesIn' },
  { key: 'invoices-out', label: 'Invoice Out', dataKey: 'invoicesOut' },
]
const PROJECT_STATUSES = ['Belum Jalan', 'Ongoing', 'Partial', 'Finish', 'Cancelled']

function Stat({ label, value, sub, className }) {
  return (
    <div className={cn('rounded-xl border bg-muted/30 p-3', className)}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-base md:text-lg font-semibold tabular mt-0.5 truncate">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

export default function ProjectDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { data, isLoading, mutate } = useSWR(id ? `/api/projects/${id}/full` : null, fetcher)
  const { data: meta } = useSWR('/api/meta', fetcher)
  const [form, setForm] = useState(null)
  const [detail, setDetail] = useState(null)
  const [busy, setBusy] = useState(false)

  if (isLoading || !data) {
    return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>
  }
  const p = data.project
  const stageIdx = STAGE_ORDER.indexOf(p.currentStage)
  const writableProject = canWrite(user, 'projects')

  const changeStatus = async (status) => {
    setBusy(true)
    try { await api(`/api/projects/${p.id}`, { method: 'PUT', body: { status } }); toast.success('Status project diupdate'); mutate() } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const withProject = (items) => items.map((r) => ({ ...r, project: { id: p.id, projectId: p.projectId, projectName: p.projectName, customer: p.customer } }))
  const initialFor = (key) => {
    const base = { projectId: p.id }
    if (['quotations', 'pos', 'invoices-out'].includes(key)) base.customer = p.customer
    if (key === 'quotations') { base.projectName = p.projectName; base.salesPic = p.salesPic; base.businessLine = p.businessLine; base.unit = p.unit }
    if (['pos', 'schedules', 'basts'].includes(key) && p.unit) base.unit = p.unit
    return base
  }

  // Overview timeline
  const timeline = [
    ...data.approaches.map((r) => ({ date: r.approachDate || r.createdAt, label: 'Approach', text: `${r.companyName} · ${r.status}` })),
    ...data.quotations.map((r) => ({ date: r.quotationDate || r.createdAt, label: 'Penawaran', text: `${r.quotationNumber} · ${formatCompact(r.revenue)} · ${r.status}` })),
    ...data.pos.map((r) => ({ date: r.poDate || r.createdAt, label: 'PO', text: `${r.poNumber} · ${formatNumber(r.quantity)} ${r.unit} · ${r.status}` })),
    ...data.schedules.map((r) => ({ date: r.actualDate || r.scheduleDate, label: 'Schedule', text: `${r.deliveryNumber} · ${formatNumber(r.qty)} ${r.unit} · ${r.status}` })),
    ...data.basts.map((r) => ({ date: r.bastDate, label: 'BAST', text: `${r.bastNumber} · ${formatNumber(r.qty)} ${r.unit} · ${r.status}` })),
    ...data.invoicesIn.map((r) => ({ date: r.invoiceDate, label: 'Invoice In', text: `${r.invoiceNumber} · ${formatCompact(r.amount)} · ${r.status}` })),
    ...data.invoicesOut.map((r) => ({ date: r.invoiceDate, label: 'Invoice Out', text: `${r.invoiceNumber} · ${formatCompact(r.amount)} · ${r.status}` })),
  ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1" />Kembali</Button>

      {/* Header */}
      <Card className="p-4 md:p-6 rounded-2xl shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-primary">{p.projectId}</span><StatusBadge status={p.businessLine} /><StatusBadge status={p.status} /></div>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight mt-1">{p.projectName}</h1>
            <p className="text-sm text-muted-foreground">{p.customer} · Sales PIC: {p.salesPic || '-'} · <span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" />{p.docCount} dokumen</span></p>
          </div>
          {writableProject && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground">Status</span>
              <Select value={p.status} onValueChange={changeStatus} disabled={busy}><SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger><SelectContent>{PROJECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
            </div>
          )}
        </div>

        {/* Stage tracker */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar -mx-1 px-1">
          {STAGE_ORDER.map((s, i) => {
            const done = i < stageIdx
            const current = i === stageIdx
            return (
              <div key={s} className="flex items-center shrink-0">
                <div className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border', done && 'bg-emerald-50 text-emerald-700 border-emerald-200', current && 'bg-primary text-white border-primary', !done && !current && 'bg-muted/40 text-muted-foreground')}>
                  {done ? <Check className="h-3 w-3" /> : <span className={cn('h-1.5 w-1.5 rounded-full', current ? 'bg-white' : 'bg-muted-foreground/40')} />}{s}
                </div>
                {i < STAGE_ORDER.length - 1 && <span className={cn('h-px w-3 md:w-5', i < stageIdx ? 'bg-emerald-300' : 'bg-border')} />}
              </div>
            )
          })}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="Revenue" value={formatCompact(p.revenue)} sub={formatIDR(p.revenue)} />
          <Stat label="HPP" value={formatCompact(p.hpp)} sub={formatIDR(p.hpp)} />
          <Stat label="Margin" value={formatCompact(p.margin)} sub={`${formatPct(p.marginPct)} margin`} />
          <Stat label="Piutang / Utang" value={formatCompact(p.piutang, false)} sub={`Utang ${formatCompact(p.utang, false)}`} />
        </div>
        <div className="rounded-xl border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium">Progress pengiriman</span>
            <span className="text-xs text-muted-foreground tabular">PO {formatNumber(p.poQty)} {p.unit} · Delivered {formatNumber(p.deliveredQty)} · Remaining {formatNumber(p.remainingQty)} {p.unit}</span>
          </div>
          <div className="flex items-center gap-3 mt-2"><Progress value={p.completionPct || 0} className="h-2" /><span className="text-sm font-semibold tabular w-12 text-right">{p.completionPct || 0}%</span></div>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start overflow-x-auto no-scrollbar h-auto p-1 flex-nowrap">
          <TabsTrigger value="overview" className="text-xs md:text-sm">Overview</TabsTrigger>
          {TABS.map((t) => <TabsTrigger key={t.key} value={t.key} className="text-xs md:text-sm">{t.label} <span className="ml-1 text-[10px] text-muted-foreground">{data[t.dataKey]?.length || 0}</span></TabsTrigger>)}
          <TabsTrigger value="documents" className="text-xs md:text-sm">Documents <span className="ml-1 text-[10px] text-muted-foreground">{data.documents.length}</span></TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 p-4 md:p-5 rounded-2xl shadow-sm">
              <h3 className="font-semibold text-sm mb-3">Timeline Aktivitas</h3>
              {timeline.length === 0 && <p className="text-sm text-muted-foreground">Belum ada aktivitas.</p>}
              <ol className="relative border-l ml-2 space-y-4">
                {timeline.slice(0, 15).map((t, i) => (
                  <li key={i} className="ml-4">
                    <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background" />
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(t.date)} · <span className="font-medium text-foreground">{t.label}</span></p>
                    <p className="text-sm">{t.text}</p>
                  </li>
                ))}
              </ol>
            </Card>
            <div className="space-y-3">
              <Card className="p-4 rounded-2xl shadow-sm">
                <h3 className="font-semibold text-sm mb-2">Kelengkapan Dokumen</h3>
                <ul className="space-y-1.5 text-sm">
                  {TABS.map((t) => {
                    const items = data[t.dataKey] || []
                    const withDoc = items.filter((r) => r.docCount > 0).length
                    return <li key={t.key} className="flex items-center justify-between"><span>{t.label}</span><span className={cn('text-xs font-medium', items.length && withDoc < items.length ? 'text-amber-600' : 'text-muted-foreground')}>{withDoc}/{items.length} ada file</span></li>
                  })}
                </ul>
              </Card>
              {data.stocks.length > 0 && (
                <Card className="p-4 rounded-2xl shadow-sm">
                  <h3 className="font-semibold text-sm mb-2">Stok</h3>
                  {data.stocks.map((s) => <div key={s.id} className="flex justify-between text-sm"><span>{s.item}</span><span className="tabular">{formatNumber(s.currentStock)} {s.unit} · {formatCompact(s.stockValue, false)}</span></div>)}
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {TABS.map((t) => {
          const config = STAGES[t.key]
          const items = withProject(data[t.dataKey] || [])
          const writable = canWrite(user, t.key)
          return (
            <TabsContent key={t.key} value={t.key} className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{items.length} {t.label.toLowerCase()} pada project ini</p>
                {writable && <Button size="sm" onClick={() => setForm({ config, initial: initialFor(t.key) })}><Plus className="h-4 w-4 mr-1" />{config.cta}</Button>}
              </div>
              {items.length === 0 ? <EmptyState title={config.emptyTitle} text={config.emptyText} cta={writable ? config.cta : null} onCta={() => setForm({ config, initial: initialFor(t.key) })} icon={FileText} /> : (
                <>
                  <div className="hidden md:block"><RecordTable config={config} items={items} onRowClick={(r) => setDetail({ config, record: r })} compact /></div>
                  <div className="md:hidden"><RecordCards config={config} items={items} onRowClick={(r) => setDetail({ config, record: r })} /></div>
                </>
              )}
            </TabsContent>
          )
        })}

        <TabsContent value="documents" className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">Semua dokumen dari seluruh tahap project ini.</p>
          <AttachmentList documents={data.documents} canEdit={user?.role !== 'management'} onChange={() => mutate()} />
          {user?.role !== 'management' && <DocumentUploader entityType="projects" entityId={p.id} projectId={p.id} categories={meta?.settings?.documentCategories || []} category="Lainnya" onUploaded={() => mutate()} />}
        </TabsContent>
      </Tabs>

      <RecordFormDrawer config={form?.config} open={!!form} onOpenChange={(o) => !o && setForm(null)} initial={form?.initial} meta={meta} lockProject onSaved={() => { setForm(null); mutate() }} />
      {detail && (
        <RecordDetailDrawer config={detail.config} record={detail.record} open={!!detail} onOpenChange={(o) => !o && setDetail(null)} onEdit={(r) => { setDetail(null); setForm({ config: detail.config, initial: r }) }} onChanged={() => mutate()} meta={meta} onAction={() => router.push(detail.config.path)} />
      )}
    </div>
  )
}
