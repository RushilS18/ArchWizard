'use client';

import { useState } from 'react';

import { buildFile3dmBrowser } from '@/lib/geometry/rhino-browser';
import { decomposeWall } from '@/lib/geometry/wall-decompose';
import type { SolidSpec, WallSpec } from '@/lib/geometry/types';

const wall: WallSpec = {
  id: 'W-01',
  xStart: 0,
  xEnd: 6.0,
  y: 0,
  thickness: 0.3,
  baseZ: 0,
  height: 3.0,
  openings: [
    { id: 'win1', kind: 'window', xStart: 1.4, width: 1.2, sill: 0.9, head: 2.1 },
    { id: 'dr1', kind: 'door', xStart: 3.8, width: 0.9, sill: 0, head: 2.1 },
  ],
};

const literalSolids: SolidSpec[] = [
  {
    type: 'glazing',
    layer: 'A-GLAZ',
    name: 'W-01/glz1',
    min: [1.4, -0.015, 0.9],
    max: [2.6, 0.015, 2.1],
  },
  {
    type: 'door',
    layer: 'A-DOOR',
    name: 'W-01/dr1',
    min: [3.8, -0.02, 0],
    max: [4.7, 0.02, 2.1],
  },
  {
    type: 'slab',
    layer: 'A-SLAB',
    name: 'S-L00',
    min: [0, -3.0, -0.25],
    max: [6.0, 3.0, 0],
  },
];

export default function SpikePage() {
  const [status, setStatus] = useState('idle');

  async function generateFile() {
    setStatus('generating…');

    try {
      const wallSolids = decomposeWall(wall);
      const bytes = await buildFile3dmBrowser([...wallSolids, ...literalSolids]);
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      const blob = new Blob([buffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'spike-wall-browser.3dm';
      link.click();
      URL.revokeObjectURL(url);
      setStatus(`done: ${bytes.byteLength} bytes`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      setStatus(`ERROR: ${message}`);
    }
  }

  return (
    <main>
      <h1>Browser rhino3dm spike</h1>
      <button type="button" onClick={generateFile}>
        Generate .3dm in browser
      </button>
      <p>{status}</p>
    </main>
  );
}
