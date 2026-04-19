import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** Inline "copy to clipboard" button with a 2s success state. Used in the manual-install modal
 *  next to each shell command so the admin can paste without selecting. */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="text-ndp-text-dim hover:text-ndp-text transition-colors"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-ndp-success" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

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
