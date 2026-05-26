import { ReactNode } from 'react';

/**
 * Lightweight on-hover tooltip. Pure Tailwind, no portal, no deps.
 * Place `<InfoTip>` next to a label; the popover anchors to the icon.
 */
export function InfoTip({ children, width = 'w-72', align = 'left' }: {
  children: ReactNode;
  width?: string;
  align?: 'left' | 'right';
}) {
  return (
    <span className="group relative inline-flex items-center">
      <span
        aria-label="info"
        className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center
                   rounded-full border border-muted/40 dark:border-muted-dark/40
                   text-[9px] font-medium text-muted dark:text-muted-dark
                   cursor-help select-none leading-none"
      >
        i
      </span>
      <span
        role="tooltip"
        className={`pointer-events-none invisible opacity-0
                    group-hover:visible group-hover:opacity-100
                    absolute top-full mt-1.5 z-30 ${width} ${align === 'right' ? 'right-0' : 'left-0'}
                    p-2.5 text-[11px] leading-snug
                    bg-ink dark:bg-bg text-bg dark:text-ink
                    shadow-lg border border-ink dark:border-line
                    transition-opacity`}
      >
        {children}
      </span>
    </span>
  );
}
