import type { ReactNode } from 'react';
import { CircleAlert, Inbox, LoaderCircle, LockKeyhole, SearchX, ServerCrash, TimerReset, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from './Button';

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2.5 px-6 py-14 text-center', className)}>
      <div className="grid size-12 place-items-center rounded-full bg-brand-50 text-brand-600">
        <Icon size={22} strokeWidth={1.7} />
      </div>
      <p className="text-[14px] font-semibold text-ink">{title}</p>
      {description && <p className="max-w-sm text-[13px] text-muted">{description}</p>}
      {action}
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-muted">
      <LoaderCircle size={22} className="animate-spin text-brand-600" />
      <p className="text-[13px]">{label}</p>
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', description, onRetry }: { title?: string; description?: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={ServerCrash} title={title} description={description}
      action={onRetry ? <Button size="sm" onClick={onRetry} className="mt-1">Try again</Button> : undefined}
    />
  );
}

export function PermissionDenied({ what = 'this page' }: { what?: string }) {
  return <EmptyState icon={LockKeyhole} title="Permission denied" description={`Your role does not have access to ${what}. Ask an administrator to change your role.`} />;
}

export function SessionExpiredState({ onLogin }: { onLogin: () => void }) {
  return (
    <EmptyState
      icon={TimerReset} title="Session expired" description="You were signed out after a period of inactivity. Please sign in again to continue."
      action={<Button size="sm" variant="primary" onClick={onLogin} className="mt-1">Back to login</Button>}
    />
  );
}

export function NotFoundState({ onHome }: { onHome: () => void }) {
  return (
    <EmptyState
      icon={SearchX} title="Page not found" description="The page you're looking for doesn't exist or may have moved."
      action={<Button size="sm" onClick={onHome} className="mt-1">Go to dashboard</Button>}
    />
  );
}

export function InlineError({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-red-600">
      <CircleAlert size={13} /> {children}
    </p>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-[#e7ece8]', className)} />;
}

export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="p-4">
      <div className="mb-3 flex gap-3">
        {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} className="h-4 flex-1" />)}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="mb-2.5 flex gap-3">
          {Array.from({ length: cols }).map((_, c) => <Skeleton key={c} className="h-8 flex-1" />)}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-card border border-line bg-white p-4', className)}>
      <Skeleton className="mb-3 h-4 w-24" />
      <Skeleton className="h-7 w-16" />
    </div>
  );
}
