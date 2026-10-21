import type { ComponentType } from 'react';

export interface ComponentExample {
  label: string;
  eyebrow: string;
  title: string;
  icon: string;
  Component: ComponentType;
}

const modules = import.meta.glob<{ default: ComponentExample }>('./*.tsx', { eager: true });
export const componentExamples: Record<string, ComponentExample> = Object.fromEntries(
  Object.entries(modules)
    .sort(([, a], [, b]) => a.default.eyebrow.localeCompare(b.default.eyebrow))
    .map(([path, module]) => [path.replace('./', '').replace('.tsx', ''), module.default]),
);
