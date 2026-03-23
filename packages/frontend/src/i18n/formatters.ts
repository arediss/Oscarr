import i18n from './index';

export function localizedDate(date: string | Date, options?: Intl.DateTimeFormatOptions) {
  return new Date(date).toLocaleDateString(i18n.language, options);
}

export function localizedDateTime(date: string | Date, options?: Intl.DateTimeFormatOptions) {
  return new Date(date).toLocaleString(i18n.language, options);
}

export function localizedTime(date: string | Date, options?: Intl.DateTimeFormatOptions) {
  return new Date(date).toLocaleTimeString(i18n.language, options);
}
