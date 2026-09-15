import type { ComponentProps, ReactNode } from 'react';
import { LoaderCircle, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'subtle';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900 shadow-[0_1px_0_rgb(255_255_255/0.08)_inset]',
  accent: 'bg-fresh-500 text-white hover:bg-fresh-600',
  secondary: 'bg-white text-ink border border-line hover:bg-canvas hover:border-[#d3dbd5]',
  subtle: 'bg-brand-50 text-brand-800 hover:bg-brand-100',
  ghost: 'text-muted hover:bg-brand-50 hover:text-ink',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

const SIZES: Record<ButtonSize, string> = {
  xs: 'h-7 px-2 text-xs gap-1 rounded-md',
  sm: 'h-8 px-2.5 text-[13px] gap-1.5 rounded-lg',
  md: 'h-9 px-3.5 text-[13px] gap-2 rounded-lg',
  lg: 'h-11 px-5 text-sm gap-2 rounded-[10px]',
};

interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'secondary', size = 'md', icon: Icon, iconRight: IconRight, loading, className, children, disabled, type = 'button', ...rest
}: ButtonProps) {
  const iconSize = size === 'lg' ? 18 : size === 'xs' ? 14 : 16;
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors select-none',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant], SIZES[size], !children && 'aspect-square px-0', className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle size={iconSize} className="animate-spin" /> : Icon ? <Icon size={iconSize} strokeWidth={2} /> : null}
      {children}
      {IconRight && !loading ? <IconRight size={iconSize} strokeWidth={2} /> : null}
    </button>
  );
}

interface IconButtonProps extends ComponentProps<'button'> {
  icon: LucideIcon;
  label: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
  badge?: number;
}

export function IconButton({ icon: Icon, label, size = 'md', variant = 'ghost', badge, className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center transition-colors disabled:opacity-50',
        VARIANTS[variant], SIZES[size], 'aspect-square px-0', className,
      )}
      {...rest}
    >
      <Icon size={size === 'lg' ? 20 : 18} strokeWidth={1.9} />
      {badge ? (
        <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white ring-2 ring-white">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </button>
  );
}
