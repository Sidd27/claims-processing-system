import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive/10 text-destructive',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

const STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-gray-100 text-gray-700',
  under_review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  partially_approved: 'bg-blue-100 text-blue-800',
  denied: 'bg-red-100 text-red-800',
  paid: 'bg-purple-100 text-purple-800',
  disputed: 'bg-orange-100 text-orange-800',
  covered: 'bg-green-100 text-green-800',
  partially_covered: 'bg-blue-100 text-blue-800',
  pending: 'bg-gray-100 text-gray-600',
  needs_review: 'bg-yellow-100 text-yellow-800',
  open: 'bg-orange-100 text-orange-800',
  resolved: 'bg-gray-100 text-gray-600',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn('border-transparent', STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700')}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}

export { Badge, badgeVariants, StatusBadge };
