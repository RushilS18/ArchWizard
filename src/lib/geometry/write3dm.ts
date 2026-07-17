import rhino3dm from 'rhino3dm';

import { buildFile3dmWith } from './build-3dm-core';
import type { SolidSpec } from './types';

let rhinoModulePromise: ReturnType<typeof rhino3dm> | null = null;

async function getRhinoModule() {
  if (!rhinoModulePromise) {
    rhinoModulePromise = rhino3dm();
  }
  return rhinoModulePromise;
}

export async function buildFile3dm(solids: SolidSpec[]): Promise<Uint8Array> {
  const rhino = await getRhinoModule();
  return buildFile3dmWith(rhino, solids);
}
