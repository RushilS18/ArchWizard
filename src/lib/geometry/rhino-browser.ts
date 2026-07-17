import type rhino3dmFactory from 'rhino3dm';

import { buildFile3dmWith } from './build-3dm-core';
import type { RhinoModule } from './build-3dm-core';
import type { SolidSpec } from './types';

type RhinoFactory = typeof rhino3dmFactory;

let rhinoBrowserPromise: Promise<RhinoModule> | null = null;

export async function getRhinoBrowser(): Promise<RhinoModule> {
  if (typeof document === 'undefined') {
    throw new Error('rhino3dm browser loading was attempted outside the browser');
  }

  if (!rhinoBrowserPromise) {
    rhinoBrowserPromise = (async () => {
      const scriptId = 'rhino3dm-umd';
      const scriptUrl = '/rhino3dm/rhino3dm.js';

      if (!document.getElementById(scriptId)) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.id = scriptId;
          script.src = scriptUrl;
          script.async = false;
          script.onload = () => resolve();
          script.onerror = () => {
            reject(new Error(`Failed to load rhino3dm browser script from ${scriptUrl}`));
          };
          document.head.appendChild(script);
        });
      }

      const browserGlobal = globalThis as unknown as { rhino3dm?: RhinoFactory };
      const factory = browserGlobal.rhino3dm;
      if (!factory) {
        throw new Error('rhino3dm browser script loaded but the global factory was not found');
      }
      return factory();
    })();
  }
  return rhinoBrowserPromise;
}

export async function buildFile3dmBrowser(solids: SolidSpec[]): Promise<Uint8Array> {
  const rhino = await getRhinoBrowser();
  return buildFile3dmWith(rhino, solids);
}
