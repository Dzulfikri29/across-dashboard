import { cn } from '@/lib/utils'

const TONES = {
  gray: 'bg-slate-100 text-slate-700 border-slate-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  yellow: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  teal: 'bg-teal-50 text-teal-700 border-teal-200',
}

const MAP = {
  Draft: 'gray', New: 'gray', 'Not Started': 'gray', 'Belum Jalan': 'gray',
  Ongoing: 'blue', Sent: 'blue', Contacted: 'blue', Confirmed: 'blue', Running: 'blue', Scheduled: 'blue', 'In Transit': 'blue', Received: 'blue', Uploaded: 'blue', 'Follow Up': 'blue',
  Complete: 'green', Completed: 'green', Paid: 'green', Approved: 'green', Delivered: 'green', Verified: 'green', Finish: 'green', Qualified: 'green', Closed: 'green',
  Partial: 'yellow', 'Partial Paid': 'yellow', Negotiation: 'yellow',
  Overdue: 'red', Delayed: 'red', Lost: 'red', Cancelled: 'red',
  Trading: 'teal', Logistics: 'blue',
}

export function statusTone(status) {
  return MAP[status] || 'gray'
}

export function StatusBadge({ status, className, size = 'sm' }) {
  if (!status) return <span className="text-muted-foreground">-</span>
  const tone = TONES[statusTone(status)]
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-md border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        tone,
        className
      )}
    >
      {status}
    </span>
  )
}

export default StatusBadge
