import * as Icons from 'lucide-react';

interface DynamicIconProps extends Icons.LucideProps {
  name: string;
}

export function DynamicIcon({ name, ...props }: DynamicIconProps) {
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[name];
  if (!Icon) return null;
  return <Icon {...props} />;
}
