import { applyUseCaseDefaults, type DesignRequirements } from './DesignRequirements';
import type { SeatingLayout } from '../room/SeatingGenerator';

export type RequirementIssueSeverity = 'error' | 'warning' | 'data_incomplete';

export interface RequirementIssue {
  code: string;
  severity: RequirementIssueSeverity;
  message: string;
}

export interface RequirementsValidation {
  ok: boolean;
  normalized: DesignRequirements;
  issues: RequirementIssue[];
}

const LAYOUTS: SeatingLayout[] = [
  'boardroom',
  'conference',
  'classroom',
  'training',
  'flexible',
  'custom',
  'theater',
  'u_shape',
  'hollow_square',
  'auditorium_tiered'
];

export function validateDesignRequirements(req: DesignRequirements): RequirementsValidation {
  const issues: RequirementIssue[] = [];
  const r = req.room;
  if (r.length == null || r.width == null || r.height == null) {
    issues.push({
      code: 'REQ-ROOM-INCOMPLETE',
      severity: 'data_incomplete',
      message: 'DATA INCOMPLETE — room length, width, and height are required before generating a design.'
    });
  } else {
    if (!(r.length > 0) || !(r.width > 0) || !(r.height > 0)) {
      issues.push({
        code: 'REQ-ROOM-INVALID',
        severity: 'error',
        message: 'ERROR — room dimensions must be positive numbers (meters).'
      });
    }
    if (r.length > 80 || r.width > 80 || r.height > 20) {
      issues.push({
        code: 'REQ-ROOM-EXTREME',
        severity: 'warning',
        message: 'WARNING — dimensions are outside typical meeting-room range. Generation will still attempt a design.'
      });
    }
  }

  if (req.seating.count == null) {
    issues.push({
      code: 'REQ-SEATS-INCOMPLETE',
      severity: 'data_incomplete',
      message: 'DATA INCOMPLETE — seat count is required.'
    });
  } else if (!Number.isFinite(req.seating.count) || req.seating.count < 1 || !Number.isInteger(req.seating.count)) {
    issues.push({
      code: 'REQ-SEATS-INVALID',
      severity: 'error',
      message: 'ERROR — seat count must be a positive integer.'
    });
  }

  if (req.seating.layout !== 'auto' && !LAYOUTS.includes(req.seating.layout)) {
    issues.push({
      code: 'REQ-LAYOUT-UNSUPPORTED',
      severity: 'warning',
      message: 'WARNING — seating layout is not a supported generator layout.'
    });
  }

  if (req.presentation.sizeMinIn != null && req.presentation.sizeMaxIn != null) {
    if (req.presentation.sizeMinIn > req.presentation.sizeMaxIn) {
      issues.push({
        code: 'REQ-SIZE-RANGE',
        severity: 'error',
        message: 'ERROR — display size minimum is greater than maximum.'
      });
    }
  }

  const blocking = issues.some((i) => i.severity === 'error' || i.severity === 'data_incomplete');
  return {
    ok: !blocking,
    normalized: applyUseCaseDefaults(req),
    issues
  };
}
