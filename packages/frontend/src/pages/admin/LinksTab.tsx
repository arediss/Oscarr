import { AdminTabLayout } from './AdminTabLayout';
import { CustomLinksEditor } from './links/CustomLinksEditor';

/**
 * Admin → Configuration → Liens rapides. Wraps CustomLinksEditor in the admin tab chrome so it
 * gets its own dedicated page rather than living buried in the Instance tab. The editor itself is
 * fully self-contained (loads + saves via /api/admin/custom-links, refreshes FeaturesContext on
 * save), so this file is a thin router-level shell.
 */
export function LinksTab() {
  return (
    <AdminTabLayout>
      <CustomLinksEditor />
    </AdminTabLayout>
  );
}
