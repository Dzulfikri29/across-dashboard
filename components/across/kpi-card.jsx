import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function KpiCard({ label, value, sub, icon: Icon, tone = 'blue', loading, hint, className }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600',
    teal: 'bg-teal-50 text-teal-600',
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    purple: 'bg-purple-50 text-purple-600',
    slate: 'bg-slate-100 text-slate-600',
  }
  return (
    <Card className={cn('p-4 md:p-5 shadow-sm border-border/70 rounded-2xl', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs md:text-sm font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span className={cn('h-8 w-8 shrink-0 rounded-lg grid place-items-center', tones[tone])}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="h-7 w-28 mt-2" />
      ) : (
        <p className="mt-1.5 text-xl md:text-2xl font-semibold tracking-tight tabular">{value}</p>
      )}
      {(sub || hint) && (
        <p className="mt-1 text-xs text-muted-foreground">{sub || hint}</p>
      )}
    </Card>
  )
}

export default KpiCard
