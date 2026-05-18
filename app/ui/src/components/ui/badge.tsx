import { cn } from '@/lib/utils'

const STATUS_COLORS: Record<string, string> = {
  submitted:          'bg-gray-100 text-gray-700',
  under_review:       'bg-yellow-100 text-yellow-800',
  approved:           'bg-green-100 text-green-800',
  partially_approved: 'bg-blue-100 text-blue-800',
  denied:             'bg-red-100 text-red-800',
  paid:               'bg-purple-100 text-purple-800',
  disputed:           'bg-orange-100 text-orange-800',
  covered:            'bg-green-100 text-green-800',
  partially_covered:  'bg-blue-100 text-blue-800',
  pending:            'bg-gray-100 text-gray-600',
  needs_review:       'bg-yellow-100 text-yellow-800',
  open:               'bg-orange-100 text-orange-800',
  resolved:           'bg-gray-100 text-gray-600',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
      STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700'
    )}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}
