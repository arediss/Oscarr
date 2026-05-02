/** Monogram tile for a plugin — first letter of the name inside a colored square. Used in both
 *  the Installed and Discover grids as a placeholder until plugins ship their own icon. */
export function PluginInitial({ name }: { name: string }) {
  const letter = name.charAt(0).toUpperCase();
  return (
    <div className="w-12 h-12 rounded-xl bg-ndp-accent/15 flex items-center justify-center text-ndp-accent font-bold text-lg flex-shrink-0">
      {letter}
    </div>
  );
}
