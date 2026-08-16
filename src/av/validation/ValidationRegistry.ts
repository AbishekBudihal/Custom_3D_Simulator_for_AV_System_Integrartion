/**
 * ValidationRegistry.ts
 * Pluggable check list. Future mic/audio/camera checks register here
 * instead of getting their own dashboards.
 */

import type { ValidationCheck } from './ValidationTypes';

export class ValidationRegistry {
  private checks: ValidationCheck[] = [];

  register(check: ValidationCheck): void {
    if (this.checks.some((c) => c.code === check.code)) return;
    this.checks.push(check);
  }

  list(): ValidationCheck[] {
    return [...this.checks];
  }

  byCategory(category: ValidationCheck['category']): ValidationCheck[] {
    return this.checks.filter((c) => c.category === category);
  }

  clear(): void {
    this.checks = [];
  }
}

export const validationRegistry = new ValidationRegistry();
