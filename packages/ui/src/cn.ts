import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind class names; later classes win (the shadcn/ui convention). */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
