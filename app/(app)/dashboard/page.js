'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Wallet, TrendingUp, ArrowUpRight, ArrowDownLeft, Boxes, ChevronRight, AlertTriangle, AlertCircle, Info, Paperclip, CheckCircle2, Target } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { KpiCard } from '@/components/across/kpi-card'
import { StatusBadge } from '@/components/across/status-badge'
import { fetcher, formatCompact, formatPct, formatIDR } from '@/lib/format'
import { cn } from '@/lib/utils'

const ALL = '__all__'
const PERIODS = [
  { v: 'all', l: 'Semua periode' },
  { v: 'this_month', l: 'Bulan ini' },
  { v: 'last_3_months', l: '3 bulan terakhir' },
  { v: 'this_year', l: 'Tahun ini' },
]
const STATUSES = ['Belum Jalan', 'Ongoing', 'Partial', 'Finish', 'Cancelled']
const ALERT_ICON = { danger: { Icon: AlertCircle, cls: 'text-red-600 bg-red-50 border-red-100' }, warning: { Icon: AlertTriangle, cls: 'text-amber-600 bg-amber-50 border-amber-100' }, info: { Icon: Info, cls: 'text-blue-600 bg-blue-50 border-blue-100' } }

export function PipelineStages({ pipeline = [], loading }) {
  if (loading) return <div className="grid grid-cols-2 md:grid-cols-7 gap-2">{[...Array(7)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:items-stretch gap-2">
      {pipeline.map((s, i) => (
        <div key={s.key} className="flex items-center md:flex-1 min-w-0">
          <Link href={s.href} className="group flex-1 rounded-xl border bg-card p-3 hover:border-primary/60 hover:shadow-sm transition-all min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground truncate">{s.label}</p>
            <p className="text-2xl font-semibold tabular mt-0.5">{s.count}</p>
            <p className="text-[11px] text-muted-foreground truncate h-4">{s.value ? formatCompact(s.value, false) : ''}</p>
            <span className="mt-1.5 inline-flex items-center text-[11px] font-medium text-primary group-hover:underline">Lihat Data <ChevronRight className="h-3 w-3" /></span>
          </Link>
          {i < pipeline.length - 1 && <ChevronRight className="hidden md:block h-4 w-4 mx-0.5 text-muted-foreground/50 shrink-0" />}
        </div>
      ))}
    </div>
  )
}

export function AlertPanel({ alerts = [], loading, className }) {
  const router = useRouter()
  return (
    <Card className={cn('p-4 md:p-5 rounded-2xl shadow-sm', className)}>
      <h3 className="font-semibold text-sm">Yang Perlu Diperhatikan Hari Ini</h3>
      <p className="text-xs text-muted-foreground mt-0.5 mb-3">Hanya item yang butuh tindakan.</p>
      {loading && <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>}
      {!loading && alerts.length === 0 && (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground"><CheckCircle2 className="h-6 w-6 mx-auto text-emerald-500 mb-1" />Semua aman. Tidak ada tindakan yang tertunda.</div>
      )}
      <div className="space-y-2">
        {alerts.map((a, i) => {
          const { Icon, cls } = ALERT_ICON[a.type] || ALERT_ICON.info
          return (
            <button key={i} onClick={() => router.push(a.href)} className={cn('w-full flex items-center gap-3 rounded-xl border p-3 text-left hover:shadow-sm transition-shadow bg-card', cls.split(' ')[2])}>
              <span className={cn('h-8 w-8 shrink-0 rounded-lg grid place-items-center', cls)}><Icon className="h-4 w-4" /></span>
              <span className="text-sm flex-1">{a.text}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          )
        })}
      </div>
    </Card>
  )
}

function DashboardInner() {
  const [bl, setBl] = useState('All')
  const [period, setPeriod] = useState('all')
  const [sales, setSales] = useState('')
  const [status, setStatus] = useState('')
  const params = new URLSearchParams({ businessLine: bl, period })
  if (sales) params.set('salesPic', sales)
  if (status) params.set('status', status)
  const { data, isLoading } = useSWR(`/api/dashboard?${params}`, fetcher)
  const k = data?.kpis || {}
  const projects = data?.recentProjects || []

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">Dashboard Ringkas Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Monitoring progres project, dokumen, dan summary bisnis dalam satu tempat.</p>
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0">
          <div className="inline-flex rounded-lg border bg-card p-0.5 shrink-0">
            {['All', 'Trading', 'Logistics'].map((b) => (
              <button key={b} onClick={() => setBl(b)} className={cn('px-3 h-8 rounded-md text-xs font-medium', bl === b ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted')}>{b}</button>
            ))}
          </div>
          <Select value={period} onValueChange={setPeriod}><SelectTrigger className="w-40 h-9 bg-card shrink-0"><SelectValue /></SelectTrigger><SelectContent>{PERIODS.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}</SelectContent></Select>
          <Select value={sales || ALL} onValueChange={(v) => setSales(v === ALL ? '' : v)}><SelectTrigger className="w-40 h-9 bg-card shrink-0"><SelectValue placeholder="Sales PIC" /></SelectTrigger><SelectContent><SelectItem value={ALL}>Semua Sales</SelectItem>{(data?.salesPics || []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
          <Select value={status || ALL} onValueChange={(v) => setStatus(v === ALL ? '' : v)}><SelectTrigger className="w-40 h-9 bg-card shrink-0"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value={ALL}>Semua Status</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard label="Omzet" value={formatCompact(k.omzet)} sub="Sumber: PO Masuk (Nilai Akhir PO)" icon={Wallet} tone="blue" loading={isLoading} />
        <KpiCard label="Potential Pipeline" value={formatCompact(k.potentialPipeline)} sub="Proyeksi Penawaran berjalan" icon={Target} tone="indigo" loading={isLoading} />
        <KpiCard label="Margin" value={formatCompact(k.margin)} sub={`${formatPct(k.marginPct)} dari Nilai Akhir PO`} icon={TrendingUp} tone="teal" loading={isLoading} />
        <KpiCard label="Piutang" value={formatCompact(k.piutang)} sub="Outstanding invoice out" icon={ArrowUpRight} tone="green" loading={isLoading} />
        <KpiCard label="Utang" value={formatCompact(k.utang)} sub="Outstanding invoice vendor" icon={ArrowDownLeft} tone="amber" loading={isLoading} />
        <KpiCard label="Stok" value={formatCompact(k.stok)} sub="If applicable · dilaporkan manual" icon={Boxes} tone="slate" loading={isLoading} />
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between"><h2 className="font-semibold text-sm">Pipeline Progress</h2><span className="text-xs text-muted-foreground">{data?.totalProjects ?? '-'} project</span></div>
        <PipelineStages pipeline={data?.pipeline} loading={isLoading} />
      </section>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 md:p-5 pb-3">
            <div><h2 className="font-semibold text-sm">Project Terbaru</h2><p className="text-xs text-muted-foreground">Update terakhir di setiap project.</p></div>
            <Button variant="ghost" size="sm" asChild><Link href="/projects">Lihat semua <ChevronRight className="h-4 w-4 ml-1" /></Link></Button>
          </div>
          {isLoading ? <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}</div> : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50">
                    {['Project ID', 'Customer', 'Business Line', 'Tahap Saat Ini', 'Dokumen', 'Nilai Project', 'Margin', 'Status'].map((h) => <TableHead key={h} className="text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</TableHead>)}
                  </TableRow></TableHeader>
                  <TableBody>
                    {projects.map((p) => (
                      <TableRow key={p.id} className="cursor-pointer" onClick={() => (window.location.href = `/projects/${p.id}`)}>
                        <TableCell className="font-medium text-primary text-sm whitespace-nowrap"><Link href={`/projects/${p.id}`}>{p.projectId}</Link></TableCell>
                        <TableCell className="text-sm"><span className="block font-medium">{p.customer}</span><span className="block text-xs text-muted-foreground truncate max-w-[220px]">{p.projectName}</span></TableCell>
                        <TableCell><StatusBadge status={p.businessLine} /></TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{p.currentStage}</TableCell>
                        <TableCell className="text-xs"><span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" />{p.docCount || 0} docs</span></TableCell>
                        <TableCell className="text-sm tabular whitespace-nowrap" title={formatIDR(p.revenue)}>{formatCompact(p.revenue, false)}</TableCell>
                        <TableCell className="text-sm tabular">{formatPct(p.marginPct)}</TableCell>
                        <TableCell><StatusBadge status={p.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="md:hidden divide-y">
                {projects.map((p) => (
                  <Link key={p.id} href={`/projects/${p.id}`} className="block p-4 active:bg-muted/40">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><p className="text-xs text-primary font-medium">{p.projectId}</p><p className="font-semibold text-sm truncate">{p.customer}</p><p className="text-xs text-muted-foreground truncate">{p.projectName}</p></div>
                      <StatusBadge status={p.status} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{p.currentStage}</span>
                      <span className="font-semibold text-foreground tabular">{formatCompact(p.revenue, false)}</span>
                      <span className="inline-flex items-center gap-1"><Paperclip className="h-3 w-3" />{p.docCount || 0}</span>
                    </div>
                  </Link>
                ))}
              </div>
              {projects.length === 0 && <p className="p-6 text-sm text-center text-muted-foreground">Belum ada project untuk filter ini.</p>}
            </>
          )}
        </Card>
        <AlertPanel alerts={data?.alerts} loading={isLoading} />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return <Suspense fallback={null}><DashboardInner /></Suspense>
}
