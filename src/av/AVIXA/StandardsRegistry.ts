/**
 * StandardsRegistry.ts
 * Pluggable methodology layer (§11 "Standards configuration layer").
 * Lets a project swap the viewing-distance methodology — e.g. once
 * you have the licensed AVIXA DISCAS calculation implemented, or
 * to apply a company-specific / project-specific override — without
 * touching the engines that consume it.
 */

import {
  estimateViewingDistanceRange,
  type ContentType,
  type ViewingDistanceRange
} from './DisplayCriteria';

export interface ViewingDistanceMethod {
  id: string;
  label: string;
  compute: (diagonalInches: number, contentType: ContentType, aspectRatio?: string) => ViewingDistanceRange;
}

const DEFAULT_METHOD: ViewingDistanceMethod = {
  id: 'engineering_estimate_v1',
  label: 'Engineering Estimate (image-height heuristic)',
  compute: estimateViewingDistanceRange
};

export class StandardsRegistry {
  private methods = new Map<string, ViewingDistanceMethod>();
  private activeId = DEFAULT_METHOD.id;

  constructor() {
    this.methods.set(DEFAULT_METHOD.id, DEFAULT_METHOD);
  }

  register(method: ViewingDistanceMethod): void {
    this.methods.set(method.id, method);
  }

  setActive(id: string): void {
    if (this.methods.has(id)) this.activeId = id;
  }

  active(): ViewingDistanceMethod {
    return this.methods.get(this.activeId)!;
  }

  list(): ViewingDistanceMethod[] {
    return Array.from(this.methods.values());
  }
}

export const standardsRegistry = new StandardsRegistry();
