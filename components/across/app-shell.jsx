'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
  LayoutDashboard, Handshake, FileText, FileCheck2, Truck, ClipboardCheck, ArrowDownLeft, ArrowUpRight, BarChart3, Settings, FolderKanban, Boxes,
  Menu, Search, Bell, LogOut, ChevronLeft, ChevronRight, Layers, MoreHorizontal, AlertTriangle, Info, AlertCircle, ChevronRight as Chevron,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { AuthContext } from './auth-context'
import { StatusBadge } from './status-badge'
import { api, fetcher, ROLE_LABEL } from '@/lib/format'
import { cn } from '@/lib/utils'

export const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/approach', label: 'Approach', icon: Handshake },
  { href: '/penawaran', label: 'Penawaran', icon: FileText },
  { href: '/po', label: 'PO Masuk', icon: FileCheck2 },
  { href: '/schedule', label: 'Schedule', icon: Truck },
  { href: '/bast', label: 'BAST', icon: ClipboardCheck },
  { href: '/invoice-in', label: 'Invoice In', icon: ArrowDownLeft },
  { href: '/invoice-out', label: 'Invoice Out', icon: ArrowUpRight },
  { href: '/summary', label: 'Summary', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
]
const NAV_EXTRA = [
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/stock', label: 'Stok', icon: Boxes },
]
const PIPELINE_NAV = NAV.slice(1, 8)

function Brand({ collapsed }) {
  return (
    <div className={cn('flex items-center gap-2.5 px-4 h-16', collapsed && 'justify-center px-0')}>
      <span className="h-9 w-9 shrink-0 rounded-xl bg-primary grid place-items-center text-white font-bold text-lg shadow-md shadow-primary/30">A</span>
      {!collapsed && (
        <div className="leading-tight">
          <p className="font-semibold text-white text-[15px]">Across</p>
          <p className="text-[11px] text-sidebar-foreground/70">Pipeline Dashboard</p>
        </div>
      )}
    </div>
  )
}

function NavList({ collapsed, onNavigate }) {
  const pathname = usePathname()
  const Item = ({ item }) => {
    const active = pathname === item.href || pathname.startsWith(item.href + '/')
    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        title={item.label}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          active ? 'bg-primary text-white shadow-sm' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-white',
          collapsed && 'justify-center px-0'
        )}
      >
        <item.icon className="h-[18px] w-[18px] shrink-0" />
        {!collapsed && <span>{item.label}</span>}
      </Link>
    )
  }
  return (
    <nav className="flex-1 px-3 space-y-1 overflow-y-auto no-scrollbar">
      {NAV.slice(0, 1).map((i) => <Item key={i.href} item={i} />)}
      {!collapsed && <p className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-sidebar-foreground/50">Pipeline</p>}
      {PIPELINE_NAV.map((i) => <Item key={i.href} item={i} />)}
      {!collapsed && <p className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-sidebar-foreground/50">Repository & Laporan</p>}
      {NAV_EXTRA.map((i) => <Item key={i.href} item={i} />)}
      {NAV.slice(8).map((i) => <Item key={i.href} item={i} />)}
    </nav>
  )
}

function Sidebar({ collapsed, setCollapsed }) {
  return (
    <aside className={cn('hidden md:flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border fixed inset-y-0 left-0 z-40 transition-[width] duration-200', collapsed ? 'w-[68px]' : 'w-60')}>
      <Brand collapsed={collapsed} />
      <NavList collapsed={collapsed} />
      <div className="p-3 border-t border-sidebar-border">
        {!collapsed && <p className="text-[11px] text-sidebar-foreground/60 px-2 pb-2 italic">Simple Pipeline. Better Visibility.</p>}
        <Button variant="ghost" size="sm" className="w-full justify-center text-sidebar-foreground hover:bg-sidebar-accent hover:text-white" onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <><ChevronLeft className="h-4 w-4 mr-1" /> Collapse</>}
        </Button>
      </div>
    </aside>
  )
}

function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [q, setQ] = useState('')
  const router = useRouter()
  useEffect(() => { const t = setTimeout(() => setQ(term), 250); return () => clearTimeout(t) }, [term])
  const { data } = useSWR(open && q.length >= 2 ? `/api/search?q=${encodeURIComponent(q)}` : null, fetcher)
  useEffect(() => {
    const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(true) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const go = (href) => { setOpen(false); setTerm(''); router.push(href) }
  return (
    <>
      <button onClick={() => setOpen(true)} className="hidden sm:flex items-center gap-2 h-9 w-64 lg:w-80 rounded-lg border bg-card px-3 text-sm text-muted-foreground hover:bg-muted/60">
        <Search className="h-4 w-4" /> <span className="flex-1 text-left">Cari project, PO Masuk, invoice...</span><kbd className="text-[10px] border rounded px-1">⌘K</kbd>
      </button>
      <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => setOpen(true)}><Search className="h-5 w-5" /></Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 gap-0 max-w-lg top-[10%] translate-y-0">
          <DialogTitle className="sr-only">Global search</DialogTitle>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Project ID, customer, PO Masuk, quotation, invoice, BAST..." className="border-0 focus-visible:ring-0 shadow-none h-12" />
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {q.length < 2 && <p className="text-xs text-muted-foreground p-3">Ketik minimal 2 karakter.</p>}
            {q.length >= 2 && data && data.length === 0 && <p className="text-xs text-muted-foreground p-3">Tidak ditemukan.</p>}
            {(data || []).map((r, i) => (
              <button key={i} onClick={() => go(r.href)} className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted">
                <span className="text-[10px] w-20 shrink-0 font-medium text-muted-foreground uppercase">{r.type}</span>
                <span className="min-w-0"><span className="block text-sm font-medium truncate">{r.title}</span>{r.subtitle && <span className="block text-xs text-muted-foreground truncate">{r.subtitle}</span>}</span>
                <Chevron className="h-4 w-4 ml-auto text-muted-foreground" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

const ALERT_ICON = { danger: { Icon: AlertCircle, cls: 'text-red-600 bg-red-50' }, warning: { Icon: AlertTriangle, cls: 'text-amber-600 bg-amber-50' }, info: { Icon: Info, cls: 'text-blue-600 bg-blue-50' } }

function Notifications() {
  const { data } = useSWR('/api/alerts', fetcher, { refreshInterval: 60000 })
  const alerts = data || []
  const router = useRouter()
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {alerts.length > 0 && <span className="absolute top-1.5 right-1.5 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] grid place-items-center">{alerts.length}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <p className="text-xs font-semibold px-2 py-1.5">Notifikasi</p>
        {alerts.length === 0 && <p className="text-xs text-muted-foreground p-2">Tidak ada yang perlu diperhatikan.</p>}
        {alerts.map((a, i) => {
          const { Icon, cls } = ALERT_ICON[a.type] || ALERT_ICON.info
          return (
            <button key={i} onClick={() => { setOpen(false); router.push(a.href) }} className="w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-muted">
              <span className={cn('h-7 w-7 rounded-md grid place-items-center shrink-0', cls)}><Icon className="h-3.5 w-3.5" /></span>
              <span className="text-xs">{a.text}</span>
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

function MobileBottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [pipeOpen, setPipeOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const { logout } = useAuthShell()
  const inPipeline = PIPELINE_NAV.some((n) => pathname.startsWith(n.href))
  const Tab = ({ active, icon: Icon, label, onClick }) => (
    <button onClick={onClick} className={cn('flex flex-col items-center justify-center gap-0.5 flex-1 py-2 text-[11px]', active ? 'text-primary font-medium' : 'text-muted-foreground')}>
      <Icon className="h-5 w-5" />{label}
    </button>
  )
  return (
    <>
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t flex safe-bottom" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <Tab active={pathname.startsWith('/dashboard')} icon={LayoutDashboard} label="Dashboard" onClick={() => router.push('/dashboard')} />
        <Tab active={inPipeline} icon={Layers} label="Pipeline" onClick={() => setPipeOpen(true)} />
        <Tab active={pathname.startsWith('/projects')} icon={FolderKanban} label="Documents" onClick={() => router.push('/projects')} />
        <Tab active={pathname.startsWith('/summary')} icon={BarChart3} label="Summary" onClick={() => router.push('/summary')} />
        <Tab active={pathname.startsWith('/settings') || pathname.startsWith('/stock')} icon={MoreHorizontal} label="More" onClick={() => setMoreOpen(true)} />
      </div>
      <Sheet open={pipeOpen} onOpenChange={setPipeOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetTitle className="text-sm mb-3">Pipeline</SheetTitle>
          <div className="grid grid-cols-3 gap-2">
            {PIPELINE_NAV.map((n) => (
              <button key={n.href} onClick={() => { setPipeOpen(false); router.push(n.href) }} className={cn('flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium', pathname.startsWith(n.href) ? 'border-primary bg-primary/5 text-primary' : 'bg-card')}>
                <n.icon className="h-5 w-5" />{n.label}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetTitle className="text-sm mb-3">Lainnya</SheetTitle>
          <div className="grid gap-1">
            {[{ href: '/stock', label: 'Stok', icon: Boxes }, { href: '/settings', label: 'Settings', icon: Settings }].map((n) => (
              <button key={n.href} onClick={() => { setMoreOpen(false); router.push(n.href) }} className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-muted"><n.icon className="h-4 w-4" />{n.label}</button>
            ))}
            <button onClick={logout} className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-red-600 hover:bg-muted"><LogOut className="h-4 w-4" />Logout</button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

// small internal context bridge so bottom nav can call logout
const ShellCtx = createContext({ logout: () => {} })
const useAuthShell = () => useContext(ShellCtx)

export function AppShell({ children }) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const { data, error, isLoading, mutate } = useSWR('/api/auth/me', fetcher, { shouldRetryOnError: false })

  useEffect(() => {
    if (error && error.status === 401) router.replace('/login')
  }, [error, router])

  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {})
    router.replace('/login')
  }

  const user = data?.user
  if (isLoading || (!user && !error)) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <div className="space-y-3 w-64"><Skeleton className="h-8 w-40 mx-auto" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4 mx-auto" /></div>
      </div>
    )
  }
  if (!user) return null

  const initials = (user.name || 'U').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()

  return (
    <AuthContext.Provider value={{ user, refresh: mutate, logout }}>
      <ShellCtx.Provider value={{ logout }}>
        <div className="min-h-screen bg-background">
          <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
          <div className={cn('flex flex-col min-h-screen transition-[padding] duration-200', collapsed ? 'md:pl-[68px]' : 'md:pl-60')}>
            <header className="sticky top-0 z-30 h-14 md:h-16 border-b bg-background/85 backdrop-blur flex items-center gap-2 px-3 md:px-6">
              <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileNav(true)}><Menu className="h-5 w-5" /></Button>
              <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={() => setCollapsed((c) => !c)}><Menu className="h-5 w-5" /></Button>
              <span className="md:hidden font-semibold text-sm">Across</span>
              <div className="flex-1" />
              <GlobalSearch />
              <Notifications />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-muted">
                    <Avatar className="h-8 w-8"><AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{initials}</AvatarFallback></Avatar>
                    <span className="hidden lg:block text-left leading-tight"><span className="block text-sm font-medium">{user.name}</span><span className="block text-[11px] text-muted-foreground">{ROLE_LABEL[user.role] || user.role}</span></span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel><span className="block">{user.name}</span><span className="block text-xs text-muted-foreground font-normal">{user.email}</span><span className="mt-1 inline-block"><StatusBadge status={ROLE_LABEL[user.role]} /></span></DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => router.push('/settings')}><Settings className="h-4 w-4 mr-2" />Settings</DropdownMenuItem>
                  <DropdownMenuItem onClick={logout} className="text-red-600"><LogOut className="h-4 w-4 mr-2" />Logout</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </header>
            <main className="flex-1 px-4 md:px-6 lg:px-8 py-4 md:py-6 max-w-[1600px] w-full mx-auto pb-24 md:pb-8">{children}</main>
          </div>
          <MobileBottomNav />
          <Sheet open={mobileNav} onOpenChange={setMobileNav}>
            <SheetContent side="left" className="p-0 w-72 bg-sidebar text-sidebar-foreground border-sidebar-border flex flex-col">
              <SheetTitle className="sr-only">Navigasi</SheetTitle>
              <Brand collapsed={false} />
              <NavList collapsed={false} onNavigate={() => setMobileNav(false)} />
              <p className="text-[11px] text-sidebar-foreground/60 px-5 py-4 italic border-t border-sidebar-border">Simple Pipeline. Better Visibility.</p>
            </SheetContent>
          </Sheet>
        </div>
      </ShellCtx.Provider>
    </AuthContext.Provider>
  )
}

export default AppShell
