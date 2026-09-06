'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Wallet, TrendingUp, Percent, ArrowUpRight, ArrowDownLeft, Boxes, FolderKanban, CheckCircle2 } from 'lucide-react'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { KpiCard } from '@/components/across/kpi-card'
import { StatusBadge } from '@/components/across/status-badge'
import { fetcher, formatCompact, formatPct, formatIDR } from '@/lib/format'

const ALL = '__all__'
const PERIODS = [
  { v: 'all', l: 'Semua periode' },
  { v: 'this_month', l: 'Bulan ini' },
  { v: 'last_3_months', l: '3 bulan terakhir' },
  { v: 'this_year', l: 'Tahun ini' },
]
const STATUSES = ['Belum Jalan', 'Ongoing', 'Partial', 'Finish', 'Cancelled']
const COLORS = ['#2563eb', '#0d9488', '#f59e0b', '#7c3aed', '#dc2626', '#64748b', '#0ea5e9', '#10b981']
const axisFmt = (v) => formatCompact(v, false)
const tip = (v) => formatIDR(v)

function ChartCard({ title, subtitle, children, className }) {
  return (
    <Card className={`p-4 md:p-5 rounded-2xl shadow-sm ${className || ''}`}>
      <h3 className="font-semibold text-sm">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground mb-2">{subtitle}</p>}
      <div className="h-56 mt-2">{children}</div>
    </Card>
  )
}

export default function SummaryPage() {
  const [period, setPeriod] = useState('all')
  const [bl, setBl] = useState('All')
  const [customer, setCustomer] = useState('')
  const [status, setStatus] = useState('')
  const params = new URLSearchParams({ period, businessLine: bl })
  if (customer) params.set('customer', customer)
  if (status) params.set('status', status)
  const { data, isLoading } = useSWR(`/api/summary?${params}`, fetcher)
  const k = data?.kpis || {}

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">Summary</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Ringkasan management: omzet, margin, AR/AP, dan kontribusi bisnis.</p>
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0">
          <Select value={period} onValueChange={setPeriod}><SelectTrigger className="w-40 h-9 bg-card shrink-0"><SelectValue /></SelectTrigger><SelectContent>{PERIODS.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}</SelectContent></Select>
          <Select value={bl} onValueChange={setBl}><SelectTrigger className="w-36 h-9 bg-card shrink-0"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="All">Semua BL</SelectItem><SelectItem value="Trading">Trading</SelectItem><SelectItem value="Logistics">Logistics</SelectItem></SelectContent></Select>
          <Select value={customer || ALL} onValueChange={(v) => setCustomer(v === ALL ? '' : v)}><SelectTrigger className="w-48 h-9 bg-card shrink-0"><SelectValue placeholder="Customer" /></SelectTrigger><SelectContent><SelectItem value={ALL}>Semua Customer</SelectItem>{(data?.customers || []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
          <Select value={status || ALL} onValueChange={(v) => setStatus(v === ALL ? '' : v)}><SelectTrigger className="w-40 h-9 bg-card shrink-0"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value={ALL}>Semua Status</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Omzet" value={formatCompact(k.omzet)} icon={Wallet} tone="blue" loading={isLoading} sub={k.revenueBasis === 'po_value' ? 'Basis: PO Value' : k.revenueBasis === 'completed_project' ? 'Basis: Project selesai' : 'Basis: Invoice Out'} />
        <KpiCard label="Margin" value={formatCompact(k.margin)} icon={TrendingUp} tone="teal" loading={isLoading} sub="Revenue - HPP project" />
        <KpiCard label="Margin %" value={formatPct(k.marginPct)} icon={Percent} tone="teal" loading={isLoading} sub="Total margin / total revenue" />
        <KpiCard label="Piutang" value={formatCompact(k.piutang)} icon={ArrowUpRight} tone="green" loading={isLoading} sub="Outstanding invoice out" />
        <KpiCard label="Utang" value={formatCompact(k.utang)} icon={ArrowDownLeft} tone="amber" loading={isLoading} sub="Outstanding invoice vendor" />
        <KpiCard label="Stok" value={formatCompact(k.stok)} icon={Boxes} tone="slate" loading={isLoading} sub="Dilaporkan manual" />
        <KpiCard label="Active Projects" value={k.activeProjects ?? '-'} icon={FolderKanban} tone="blue" loading={isLoading} sub="Ongoing + Partial" />
        <KpiCard label="Finished Projects" value={k.finishedProjects ?? '-'} icon={CheckCircle2} tone="green" loading={isLoading} sub="Status Finish" />
      </div>

      {isLoading ? <div className="grid md:grid-cols-2 gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}</div> : (
        <div className="grid md:grid-cols-2 gap-4">
          <ChartCard title="Omzet per Bulan" subtitle="Berdasarkan tanggal Invoice Out, 6 bulan terakhir">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byMonth} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={axisFmt} tick={{ fontSize: 11 }} width={56} axisLine={false} tickLine={false} />
                <Tooltip formatter={tip} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="omzet" name="Omzet" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Margin per Bulan" subtitle="Estimasi margin dari omzet bulanan x margin % project">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.byMonth} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={axisFmt} tick={{ fontSize: 11 }} width={56} axisLine={false} tickLine={false} />
                <Tooltip formatter={tip} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Line type="monotone" dataKey="margin" name="Margin" stroke="#0d9488" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Kontribusi Trading vs Logistics" subtitle="Berdasarkan omzet Invoice Out">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.contribution} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                  {data.contribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={tip} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Pipeline Stage Count" subtitle="Jumlah project per tahap saat ini">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.stageCounts} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="value" name="Project" fill="#7c3aed" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Aging Receivable (Piutang)" subtitle="Outstanding invoice out berdasarkan umur jatuh tempo">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.agingReceivable} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                <XAxis type="number" tickFormatter={axisFmt} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} axisLine={false} tickLine={false} />
                <Tooltip formatter={tip} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="value" name="Piutang" fill="#10b981" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Aging Payable (Utang)" subtitle="Outstanding invoice vendor berdasarkan umur jatuh tempo">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.agingPayable} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                <XAxis type="number" tickFormatter={axisFmt} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} axisLine={false} tickLine={false} />
                <Tooltip formatter={tip} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="value" name="Utang" fill="#f59e0b" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {data?.topProjects?.length > 0 && (
        <Card className="p-4 md:p-5 rounded-2xl shadow-sm">
          <h3 className="font-semibold text-sm mb-3">Top 5 Project by Revenue</h3>
          <div className="divide-y">
            {data.topProjects.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2.5 gap-3 text-sm">
                <div className="min-w-0"><p className="font-medium truncate">{p.projectId} · {p.customer}</p><p className="text-xs text-muted-foreground truncate">{p.projectName}</p></div>
                <div className="flex items-center gap-3 shrink-0"><span className="tabular font-semibold">{formatCompact(p.revenue, false)}</span><span className="text-xs text-muted-foreground tabular w-12 text-right">{formatPct(p.marginPct)}</span><StatusBadge status={p.status} /></div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
