import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'accent' | 'unread' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md';
  className?: string;
}

export function Badge({
  children,
  variant = 'default',
  size = 'sm',
  className = '',
}: BadgeProps) {
  const variantStyles = {
    default: 'bg-reader-selected text-reader-muted border-reader-border',
    accent: 'bg-reader-accentBg text-reader-accent border-reader-accent/20',
    unread: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30 font-medium',
    success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    warning: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    danger: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  }[variant];

  const sizeStyles = {
    sm: 'text-[11px] px-1.5 py-0.5',
    md: 'text-xs px-2.5 py-1',
  }[size];

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-md border tracking-wide ${variantStyles} ${sizeStyles} ${className}`}
    >
      {children}
    </span>
  );
}

