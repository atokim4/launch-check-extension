import type { CheckStatus } from './types';

/** What one check concluded. `fix` overrides the catalog default; `evidence` is redacted. */
export interface Outcome {
  status: CheckStatus;
  why: string;
  fix?: string;
  critical?: boolean;
  evidence?: string[];
}

export const skip = (why: string): Outcome => ({ status: 'skip', why });
