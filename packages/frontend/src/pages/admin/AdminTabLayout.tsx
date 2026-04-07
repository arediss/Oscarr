import type { ReactNode } from 'react';

interface AdminTabLayoutProps {
  title: string;
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
}

export function AdminTabLayout({ title, count, actions, children }: AdminTabLayoutProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between min-h-[40px]">
        <h2 className="text-lg font-semibold text-ndp-text">
          {title}{count !== undefined && ` (${count})`}
        </h2>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="animate-fade-in pb-20">
        {children}
      </div>
    </div>
  );
}
