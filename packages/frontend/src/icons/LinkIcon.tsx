import { DynamicIcon } from '@/plugins/DynamicIcon';
import { BRAND_ICONS_BY_ID } from './brandIcons';

interface LinkIconProps {
  /** Encoded icon value:
   *   - `https://…` → renders as <img>
   *   - `brand:<id>` → looks up in BRAND_ICONS_BY_ID and renders the SVG path with brand color
   *   - otherwise → treated as a Lucide icon name (DynamicIcon handles unknowns) */
  value: string;
  className?: string;
}

export function LinkIcon({ value, className }: Readonly<LinkIconProps>) {
  if (value.startsWith('https://')) {
    return <img src={value} alt="" className={className} loading="lazy" decoding="async" />;
  }
  if (value.startsWith('brand:')) {
    const id = value.slice('brand:'.length);
    const brand = BRAND_ICONS_BY_ID[id];
    if (brand) {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className={className}
          aria-label={brand.title}
          role="img"
        >
          <path d={brand.path} fill={`#${brand.hex}`} />
        </svg>
      );
    }
  }
  return <DynamicIcon name={value} className={className} />;
}
