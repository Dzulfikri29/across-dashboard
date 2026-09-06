'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { Search, Paperclip, ChevronRight, X, Plus } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/across/status-badge'
import { EmptyState } from '@/components/across/stage-page'
import { fetcher, formatCompact, formatPct, formatIDR } from '@/lib/format'

const ALL = '__all__'
const STATUSES = ['Belum Jalan', 'Ongoing', 'Partial', 'Finish', 'Cancelled']

function ProjectsInner() {
  const sp = useSearchParams()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [bl, setBl] = useState('')
  const filter = sp.get('filter') || ''
  useEffect(() => { const t = setTimeout(() => setQ(search), 300); return () => clearTimeout(t) }, [search])
  const params = new URLSearchParams({ limit: '100' })
  if (q) params.set('q', q)
  if (status) params.set('status', status)
  if (bl) params.set('businessLine', bl)
  if (filter) params.set('filter', filter)
  const { data, isLoading } = useSWR(`/api/projects?${params}`, fetcher)
  const items = data?.items || []

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Repository terpusat: setiap project menyimpan dokumen & progres dari semua tahap.</p>
      </div>
      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari Project ID, customer, nama project..." className="pl-9 bg-card" />
        </div>
        <div className="flex gap-2">
          <Select value={bl || ALL} onValueChange={(v) => setBl(v === ALL ? '' : v)}><SelectTrigger className="w-full md:w-40 bg-card"><SelectValue placeholder="Business Line" /></SelectTrigger><SelectContent><SelectItem value={ALL}>Semua BL</SelectItem><SelectItem value="Trading">Trading</SelectItem><SelectItem value="Logistics">Logistics</SelectItem></SelectContent></Select>
          <Select value={status || ALL} onValueChange={(v) => setStatus(v === ALL ? '' : v)}><SelectTrigger className="w-full md:w-40 bg-card"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value={ALL}>Semua status</SelectItem>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
          {filter && <Button variant="secondary" onClick={() => router.replace('/projects')}>Belum update <X className="h-3.5 w-3.5 ml-1.5" /></Button>}
        </div>
      </div>

      {isLoading ? <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div> : items.length === 0 ? (
        <EmptyState title="Belum ada project." text="Project dibuat otomatis saat Anda menambahkan penawaran atau mengonversi approach." />
      ) : (
        <>
          <div className="hidden md:block rounded-2xl border bg-card overflow-hidden">
            <Table>
              <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50">{['Project ID', 'Customer', 'BL', 'Project', 'Sales PIC', 'Tahap', 'Progress', 'Dokumen', 'Revenue', 'Margin %', 'Status'].map((h) => <TableHead key={h} className="text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => router.push(`/projects/${p.id}`)}>
                    <TableCell className="text-primary font-medium text-sm whitespace-nowrap">{p.projectId}</TableCell>
                    <TableCell className="text-sm font-medium">{p.customer}</TableCell>
                    <TableCell><StatusBadge status={p.businessLine} /></TableCell>
                    <TableCell className="text-sm max-w-[220px] truncate">{p.projectName}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{p.salesPic}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{p.currentStage}</TableCell>
                    <TableCell className="min-w-[120px]">{p.poQty > 0 ? <><div className="flex justify-between text-[11px] mb-1 tabular"><span>{p.completionPct}%</span><span>{p.deliveredQty}/{p.poQty} {p.unit}</span></div><Progress value={p.completionPct} className="h-1.5" /></> : <span className="text-xs text-muted-foreground">-</span>}</TableCell>
                    <TableCell className="text-xs"><span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" />{p.docCount || 0}</span></TableCell>
                    <TableCell className="text-sm tabular whitespace-nowrap" title={formatIDR(p.revenue)}>{formatCompact(p.revenue, false)}</TableCell>
                    <TableCell className="text-sm tabular">{formatPct(p.marginPct)}</TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="md:hidden grid gap-3">
            {items.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`}>
                <Card className="p-4 rounded-2xl shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><p className="text-xs text-primary font-medium">{p.projectId}</p><p className="font-semibold text-sm truncate">{p.customer}</p><p className="text-xs text-muted-foreground truncate">{p.projectName}</p></div>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{p.currentStage}</span><span className="font-semibold text-foreground tabular">{formatCompact(p.revenue, false)}</span><span className="inline-flex items-center gap-1"><Paperclip className="h-3 w-3" />{p.docCount || 0}</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function ProjectsPage() {
  return <Suspense fallback={null}><ProjectsInner /></Suspense>
}
