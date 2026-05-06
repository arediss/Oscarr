import type { ReactNode } from 'react';

interface AdminTabLayoutProps {
  /** Tab-level title. Omit when the group header (AdminPage) already names the page — avoids
   *  "Plugins / Plugins" double-title on single-tab groups. Actions remain rendered either way. */
  title?: string;
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
}

export function AdminTabLayout({ title, count, actions, children }: Readonly<AdminTabLayoutProps>) {
  const showHeader = !!title || !!actions;
  return (
    <div className="space-y-6">
      {showHeader && (
        <div className="flex items-center justify-between min-h-[40px]">
          {title ? (
            <h2 className="text-lg font-semibold text-ndp-text">
              {title}{count !== undefined && ` (${count})`}
            </h2>
          ) : (
            <div />
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="animate-fade-in pb-20">
        {children}
      </div>
    </div>
  );
}
