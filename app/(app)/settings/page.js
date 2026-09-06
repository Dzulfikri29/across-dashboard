'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Plus, X, Trash2, Save } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/across/status-badge'
import { useAuth } from '@/components/across/auth-context'
import { api, fetcher, ROLE_LABEL } from '@/lib/format'

const ROLES = ['management', 'sales', 'operations', 'finance', 'admin']

function TagEditor({ label, values = [], onChange, disabled, helper }) {
  const [v, setV] = useState('')
  const add = () => { const t = v.trim(); if (!t || values.includes(t)) return; onChange([...values, t]); setV('') }
  return (
    <div className="space-y-2">
      <Label className="text-sm">{label}</Label>
      {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
      <div className="flex flex-wrap gap-1.5">
        {values.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1 text-xs">{t}{!disabled && <button type="button" onClick={() => onChange(values.filter((x) => x !== t))} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>}</span>
        ))}
      </div>
      {!disabled && (
        <div className="flex gap-2"><Input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} placeholder="Tambah..." className="h-9" /><Button type="button" variant="outline" size="sm" className="h-9" onClick={add}><Plus className="h-4 w-4" /></Button></div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const canEdit = isAdmin || user?.role === 'management'
  const { data: settings, mutate } = useSWR('/api/settings', fetcher)
  const [s, setS] = useState(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (settings && !s) setS(settings) }, [settings, s])

  const save = async () => {
    setSaving(true)
    try { const res = await api('/api/settings', { method: 'PUT', body: s }); setS(res); mutate(res, false); toast.success('Settings tersimpan') } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  // users
  const { data: usersData, mutate: mutateUsers } = useSWR(isAdmin ? '/api/users?limit=200' : null, fetcher)
  const [newUser, setNewUser] = useState(null)
  const createUser = async () => {
    try { await api('/api/users', { method: 'POST', body: newUser }); toast.success('User ditambahkan'); setNewUser(null); mutateUsers() } catch (e) { toast.error(e.message) }
  }
  const changeRole = async (id, role) => { try { await api(`/api/users/${id}`, { method: 'PUT', body: { role } }); toast.success('Role diupdate'); mutateUsers() } catch (e) { toast.error(e.message) } }
  const deleteUser = async (id) => { if (!confirm('Hapus user ini?')) return; try { await api(`/api/users/${id}`, { method: 'DELETE' }); mutateUsers() } catch (e) { toast.error(e.message) } }

  if (!s) return null
  const rules = s.notificationRules || {}
  const setRule = (k, v) => setS({ ...s, notificationRules: { ...rules, [k]: v } })

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Master data & aturan ringkas. {!canEdit && <span className="text-amber-600">Anda hanya bisa melihat.</span>}</p>
        </div>
        {canEdit && <Button onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1.5" />{saving ? 'Menyimpan...' : 'Simpan'}</Button>}
      </div>

      <Tabs defaultValue="general">
        <TabsList className="w-full justify-start overflow-x-auto no-scrollbar h-auto p-1">
          <TabsTrigger value="general">Umum</TabsTrigger>
          <TabsTrigger value="master">Master Data</TabsTrigger>
          <TabsTrigger value="notif">Notification Rules</TabsTrigger>
          {isAdmin && <TabsTrigger value="users">Users & Roles</TabsTrigger>}
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <Card className="p-5 rounded-2xl shadow-sm space-y-4">
            <div>
              <h3 className="font-semibold text-sm">Revenue Recognition Basis</h3>
              <p className="text-xs text-muted-foreground">Menentukan bagaimana angka Omzet di Dashboard & Summary dihitung.</p>
            </div>
            <RadioGroup value={s.revenueBasis} onValueChange={(v) => canEdit && setS({ ...s, revenueBasis: v })} className="grid sm:grid-cols-3 gap-2">
              {[['invoice_out', 'Invoice Out', 'Omzet = total Invoice Out (default)'], ['po_value', 'PO Value', 'Omzet = total nilai PO aktif'], ['completed_project', 'Completed Project', 'Omzet = revenue project berstatus Finish']].map(([v, l, d]) => (
                <label key={v} className={`flex gap-3 rounded-xl border p-3 cursor-pointer ${s.revenueBasis === v ? 'border-primary bg-primary/5' : ''}`}>
                  <RadioGroupItem value={v} id={v} className="mt-0.5" disabled={!canEdit} />
                  <span><span className="block text-sm font-medium">{l}</span><span className="block text-xs text-muted-foreground">{d}</span></span>
                </label>
              ))}
            </RadioGroup>
          </Card>
        </TabsContent>

        <TabsContent value="master" className="mt-4">
          <Card className="p-5 rounded-2xl shadow-sm grid md:grid-cols-2 gap-6">
            <TagEditor label="Business Lines" values={s.businessLines} onChange={(v) => setS({ ...s, businessLines: v })} disabled={!canEdit} />
            <TagEditor label="Units" values={s.units} onChange={(v) => setS({ ...s, units: v })} disabled={!canEdit} />
            <TagEditor label="Document Categories" values={s.documentCategories} onChange={(v) => setS({ ...s, documentCategories: v })} disabled={!canEdit} />
            <TagEditor label="Project Status" values={s.projectStatuses} onChange={(v) => setS({ ...s, projectStatuses: v })} disabled={!canEdit} helper="Status dihitung otomatis dari progres, tapi bisa di-override manual di detail project." />
          </Card>
        </TabsContent>

        <TabsContent value="notif" className="mt-4">
          <Card className="p-5 rounded-2xl shadow-sm space-y-4">
            {[['quotationNoAttachment', 'Penawaran tanpa attachment'], ['poNoSchedule', 'PO belum punya schedule'], ['scheduleOverdue', 'Schedule terlambat'], ['bastMissing', 'BAST belum diupload setelah pengiriman']].map(([k, l]) => (
              <div key={k} className="flex items-center justify-between"><Label className="text-sm">{l}</Label><Switch checked={rules[k] !== false} onCheckedChange={(v) => setRule(k, v)} disabled={!canEdit} /></div>
            ))}
            <div className="grid sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5"><Label className="text-sm">Invoice jatuh tempo dalam (hari)</Label><Input type="number" value={rules.invoiceDueDays ?? 7} onChange={(e) => setRule('invoiceDueDays', Number(e.target.value))} disabled={!canEdit} /></div>
              <div className="space-y-1.5"><Label className="text-sm">Project dianggap tidak update setelah (hari)</Label><Input type="number" value={rules.projectStaleDays ?? 14} onChange={(e) => setRule('projectStaleDays', Number(e.target.value))} disabled={!canEdit} /></div>
            </div>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="users" className="mt-4">
            <Card className="p-5 rounded-2xl shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div><h3 className="font-semibold text-sm">Users</h3><p className="text-xs text-muted-foreground">Management (read-only) · Sales (Approach, Penawaran, PO) · Operations (Schedule, BAST) · Finance (Invoice) · Admin (semua)</p></div>
                <Button size="sm" onClick={() => setNewUser({ name: '', email: '', password: '', role: 'sales' })}><Plus className="h-4 w-4 mr-1" />User</Button>
              </div>
              <div className="divide-y rounded-xl border">
                {(usersData?.items || []).map((u) => (
                  <div key={u.id} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3">
                    <div className="flex-1 min-w-0"><p className="text-sm font-medium">{u.name}</p><p className="text-xs text-muted-foreground truncate">{u.email}</p></div>
                    <Select value={u.role} onValueChange={(r) => changeRole(u.id, r)} disabled={u.id === user.id}><SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger><SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent></Select>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" disabled={u.id === user.id} onClick={() => deleteUser(u.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            </Card>
            <Dialog open={!!newUser} onOpenChange={(o) => !o && setNewUser(null)}>
              <DialogContent>
                <DialogHeader><DialogTitle>Tambah User</DialogTitle></DialogHeader>
                {newUser && (
                  <div className="space-y-3">
                    <div className="space-y-1.5"><Label>Nama</Label><Input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Password</Label><Input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Role</Label><Select value={newUser.role} onValueChange={(r) => setNewUser({ ...newUser, role: r })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent></Select></div>
                  </div>
                )}
                <DialogFooter><Button variant="outline" onClick={() => setNewUser(null)}>Batal</Button><Button onClick={createUser}>Simpan</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
