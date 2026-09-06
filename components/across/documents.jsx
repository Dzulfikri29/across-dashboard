'use client'

import { useRef, useState } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import {
  FileText, FileSpreadsheet, FileImage, FileArchive, File as FileIcon, UploadCloud, Download, Eye, RefreshCw, Trash2, Camera, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api, fetcher, formatBytes, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

export function fileIcon(mime = '', name = '') {
  const n = name.toLowerCase()
  if (mime.includes('pdf') || n.endsWith('.pdf')) return { Icon: FileText, cls: 'bg-red-50 text-red-600' }
  if (mime.includes('sheet') || mime.includes('excel') || /\.(xlsx?|csv)$/.test(n)) return { Icon: FileSpreadsheet, cls: 'bg-emerald-50 text-emerald-600' }
  if (mime.includes('word') || /\.docx?$/.test(n)) return { Icon: FileText, cls: 'bg-blue-50 text-blue-600' }
  if (mime.startsWith('image/')) return { Icon: FileImage, cls: 'bg-violet-50 text-violet-600' }
  if (mime.includes('zip') || /\.(zip|rar|7z)$/.test(n)) return { Icon: FileArchive, cls: 'bg-amber-50 text-amber-600' }
  return { Icon: FileIcon, cls: 'bg-slate-100 text-slate-600' }
}

export function uploadFile({ file, entityType, entityId, projectId, category, replaceId, onProgress }) {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    form.append('entityType', entityType || '')
    form.append('entityId', entityId || '')
    form.append('projectId', projectId || '')
    form.append('category', category || '')
    if (replaceId) form.append('replaceId', replaceId)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/upload')
    xhr.withCredentials = true
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300) resolve(data)
        else reject(new Error(data.error || 'Upload gagal'))
      } catch (e) {
        reject(new Error('Upload gagal'))
      }
    }
    xhr.onerror = () => reject(new Error('Upload gagal (network)'))
    xhr.send(form)
  })
}

export function DocumentUploader({ entityType, entityId, projectId, category: defaultCategory, categories = [], onUploaded, compact = false }) {
  const inputRef = useRef(null)
  const cameraRef = useRef(null)
  const [drag, setDrag] = useState(false)
  const [uploads, setUploads] = useState([])
  const [category, setCategory] = useState(defaultCategory || '')

  const handleFiles = async (files) => {
    const list = Array.from(files || [])
    if (!list.length) return
    for (const file of list) {
      const uid = `${Date.now()}-${file.name}`
      setUploads((u) => [...u, { uid, name: file.name, progress: 0 }])
      try {
        await uploadFile({
          file, entityType, entityId, projectId, category,
          onProgress: (p) => setUploads((u) => u.map((x) => (x.uid === uid ? { ...x, progress: p } : x))),
        })
        setUploads((u) => u.filter((x) => x.uid !== uid))
        toast.success(`${file.name} berhasil diupload`)
        onUploaded && onUploaded()
      } catch (e) {
        setUploads((u) => u.filter((x) => x.uid !== uid))
        toast.error(e.message)
      }
    }
  }

  return (
    <div className="space-y-2">
      {categories.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Kategori:</span>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
            <SelectContent>
              {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'cursor-pointer rounded-xl border-2 border-dashed transition-colors grid place-items-center text-center',
          compact ? 'p-4' : 'p-6',
          drag ? 'border-primary bg-primary/5' : 'border-border bg-muted/40 hover:bg-muted/70'
        )}
      >
        <UploadCloud className="h-6 w-6 text-primary mb-1.5" />
        <p className="text-sm font-medium">Drag & drop file di sini, atau <span className="text-primary">pilih file</span></p>
        <p className="text-xs text-muted-foreground mt-0.5">PDF, Excel, Word, gambar, ZIP</p>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }} />
      </div>
      <div className="md:hidden">
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => cameraRef.current?.click()}>
          <Camera className="h-4 w-4 mr-2" /> Ambil foto dari kamera
        </Button>
      </div>
      {uploads.map((u) => (
        <div key={u.uid} className="rounded-lg border p-2.5 text-xs">
          <div className="flex justify-between mb-1"><span className="truncate">{u.name}</span><span>{u.progress}%</span></div>
          <Progress value={u.progress} className="h-1.5" />
        </div>
      ))}
    </div>
  )
}

export function AttachmentList({ documents = [], canEdit, onChange, emptyText = 'Belum ada dokumen.' }) {
  const [preview, setPreview] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const replaceRef = useRef(null)
  const [replacing, setReplacing] = useState(null)
  const [busy, setBusy] = useState(false)

  const doDelete = async () => {
    if (!confirmDel) return
    setBusy(true)
    try {
      await api(`/api/documents/${confirmDel.id}`, { method: 'DELETE' })
      toast.success('Dokumen dihapus')
      onChange && onChange()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
      setConfirmDel(null)
    }
  }

  const doReplace = async (file) => {
    if (!replacing || !file) return
    try {
      await uploadFile({ file, entityType: replacing.entityType, entityId: replacing.entityId, projectId: replacing.projectId, category: replacing.category, replaceId: replacing.id })
      toast.success('File diganti')
      onChange && onChange()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setReplacing(null)
    }
  }

  if (!documents.length) return <p className="text-sm text-muted-foreground py-2">{emptyText}</p>

  return (
    <div className="divide-y rounded-xl border bg-card">
      {documents.map((d) => {
        const { Icon, cls } = fileIcon(d.mimeType, d.fileName)
        const canPreview = (d.mimeType || '').includes('pdf') || (d.mimeType || '').startsWith('image/')
        return (
          <div key={d.id} className="flex items-center gap-3 p-3">
            <span className={cn('h-9 w-9 shrink-0 rounded-lg grid place-items-center', cls)}><Icon className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{d.fileName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {formatBytes(d.size)} · {formatDate(d.uploadedAt)} · {d.uploadedBy}{d.category ? ` · ${d.category}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              {canPreview && (
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Preview" onClick={() => setPreview(d)}><Eye className="h-4 w-4" /></Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Download" asChild>
                <a href={`/api/files/${d.id}?download=1`} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /></a>
              </Button>
              {canEdit && (
                <>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hidden sm:inline-flex" title="Replace" onClick={() => { setReplacing(d); setTimeout(() => replaceRef.current?.click(), 0) }}><RefreshCw className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700" title="Hapus" onClick={() => setConfirmDel(d)}><Trash2 className="h-4 w-4" /></Button>
                </>
              )}
            </div>
          </div>
        )
      })}
      <input ref={replaceRef} type="file" className="hidden" onChange={(e) => { doReplace(e.target.files?.[0]); e.target.value = '' }} />

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-5xl w-[96vw] h-[92vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0">
            <DialogTitle className="text-sm truncate pr-8">{preview?.fileName}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 bg-muted/40 min-h-0">
            {preview && (preview.mimeType || '').startsWith('image/') ? (
              <img src={`/api/files/${preview.id}`} alt={preview.fileName} className="h-full w-full object-contain" />
            ) : preview ? (
              <iframe title={preview.fileName} src={`/api/files/${preview.id}`} className="h-full w-full" />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus dokumen?</AlertDialogTitle>
            <AlertDialogDescription>“{confirmDel?.fileName}” akan dihapus permanen.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={doDelete} className="bg-red-600 hover:bg-red-700">Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Full documents section for a record: list + uploader (auto-refetch). */
export function RecordDocuments({ entityType, entityId, projectId, category, canEdit, hint, categories }) {
  const { data, mutate } = useSWR(entityId ? `/api/documents?entityId=${entityId}` : null, fetcher)
  const docs = data || []
  return (
    <div className="space-y-3">
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <AttachmentList documents={docs} canEdit={canEdit} onChange={() => mutate()} />
      {canEdit && (
        <DocumentUploader entityType={entityType} entityId={entityId} projectId={projectId} category={category} categories={categories} onUploaded={() => mutate()} compact />
      )}
    </div>
  )
}
