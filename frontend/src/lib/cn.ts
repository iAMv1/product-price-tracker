import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Adapted from xevrion/ui-lab (MIT) src/lib/cn.ts.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
