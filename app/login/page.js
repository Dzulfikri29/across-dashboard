'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { api, fetcher, ROLE_LABEL } from '@/lib/format'
import { CheckCircle2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('admin@across.id')
  const [password, setPassword] = useState('across123')
  const [loading, setLoading] = useState(false)
  const { data: demo } = useSWR('/api/auth/demo-users', fetcher)

  const submit = async (e) => {
    e?.preventDefault()
    setLoading(true)
    try {
      await api('/api/auth/login', { method: 'POST', body: { email, password } })
      router.replace('/dashboard')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const quick = async (u) => {
    setEmail(u.email)
    setPassword('across123')
    setLoading(true)
    try {
      await api('/api/auth/login', { method: 'POST', body: { email: u.email, password: 'across123' } })
      router.replace('/dashboard')
    } catch (err) {
      toast.error(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between bg-sidebar text-white p-12 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary/30 blur-3xl" />
        <div className="absolute bottom-0 -left-24 h-72 w-72 rounded-full bg-teal-500/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="h-11 w-11 rounded-xl bg-primary grid place-items-center font-bold text-xl shadow-lg shadow-primary/30">A</span>
          <div><p className="font-semibold text-lg leading-tight">Across</p><p className="text-xs text-white/60">Pipeline Dashboard</p></div>
        </div>
        <div className="relative space-y-6 max-w-md">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">Simple Pipeline.<br />Better Visibility.</h1>
          <p className="text-white/70">Upload dokumen, isi beberapa angka kunci, simpan. Management langsung melihat omzet, margin, piutang, utang, dan progres project.</p>
          <ul className="space-y-2 text-sm text-white/80">
            {['Approach → Penawaran → PO → Schedule → BAST → Invoice', 'Repository dokumen per project', 'Alert jatuh tempo & dokumen belum lengkap', 'Mobile-friendly untuk tim lapangan'].map((t) => (
              <li key={t} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-teal-300" />{t}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/40">© {new Date().getFullYear()} Across · Trading & Logistics</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden flex items-center gap-3">
            <span className="h-10 w-10 rounded-xl bg-primary grid place-items-center text-white font-bold text-lg">A</span>
            <div><p className="font-semibold leading-tight">Across</p><p className="text-xs text-muted-foreground">Pipeline Dashboard</p></div>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Masuk</h2>
            <p className="text-sm text-muted-foreground mt-1">Gunakan akun Anda untuk melanjutkan.</p>
          </div>
          <Card className="p-5 rounded-2xl shadow-sm">
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full h-10" disabled={loading}>{loading ? 'Memproses...' : 'Masuk'}</Button>
            </form>
          </Card>
          <div>
            <p className="text-xs text-muted-foreground mb-2">Akun demo (password: <code className="bg-muted px-1 rounded">across123</code>)</p>
            <div className="grid grid-cols-2 gap-2">
              {(demo || []).map((u) => (
                <button key={u.id} type="button" disabled={loading} onClick={() => quick(u)} className="rounded-lg border bg-card px-3 py-2 text-left hover:border-primary hover:bg-primary/5 transition-colors">
                  <span className="block text-xs font-semibold">{ROLE_LABEL[u.role] || u.role}</span>
                  <span className="block text-[11px] text-muted-foreground truncate">{u.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
