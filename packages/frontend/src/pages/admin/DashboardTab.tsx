import { AdminTabLayout } from './AdminTabLayout';
import { DashboardGrid } from './dashboard/DashboardGrid';

export function DashboardTab() {
  return (
    <AdminTabLayout>
      <DashboardGrid />
    </AdminTabLayout>
  );
}
