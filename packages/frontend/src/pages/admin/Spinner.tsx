import { Loader2 } from 'lucide-react';

export function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="w-8 h-8 text-ndp-accent animate-spin" />
    </div>
  );
}
