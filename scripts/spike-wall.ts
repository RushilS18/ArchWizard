import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { decomposeWall } from '../src/lib/geometry/wall-decompose';
import type { SolidSpec, WallSpec } from '../src/lib/geometry/types';
import { validateFile } from '../src/lib/geometry/validate3dm';
import { buildFile3dm } from '../src/lib/geometry/write3dm';

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

const EXPECTED_OBJECTS: SolidSpec[] = [
  { type: 'wall', layer: 'A-WALL', name: 'W-01/p1', min: [0, -0.15, 0], max: [1.4, 0.15, 3.0] },
  { type: 'wall', layer: 'A-WALL', name: 'W-01/s1', min: [1.4, -0.15, 0], max: [2.6, 0.15, 0.9] },
  { type: 'wall', layer: 'A-WALL', name: 'W-01/l1', min: [1.4, -0.15, 2.1], max: [2.6, 0.15, 3.0] },
  { type: 'wall', layer: 'A-WALL', name: 'W-01/p2', min: [2.6, -0.15, 0], max: [3.8, 0.15, 3.0] },
  { type: 'wall', layer: 'A-WALL', name: 'W-01/l2', min: [3.8, -0.15, 2.1], max: [4.7, 0.15, 3.0] },
  { type: 'wall', layer: 'A-WALL', name: 'W-01/p3', min: [4.7, -0.15, 0], max: [6.0, 0.15, 3.0] },
  { type: 'glazing', layer: 'A-GLAZ', name: 'W-01/glz1', min: [1.4, -0.015, 0.9], max: [2.6, 0.015, 2.1] },
  { type: 'door', layer: 'A-DOOR', name: 'W-01/dr1', min: [3.8, -0.02, 0], max: [4.7, 0.02, 2.1] },
  { type: 'slab', layer: 'A-SLAB', name: 'S-L00', min: [0, -3.0, -0.25], max: [6.0, 3.0, 0] },
];

async function main() {
  const wallSolids = decomposeWall(wall);
  const allSolids = [...wallSolids, ...literalSolids];
  const bytes = await buildFile3dm(allSolids);

  await mkdir('artifacts', { recursive: true });
  const filePath = 'artifacts/spike-wall.3dm';
  await writeFile(filePath, bytes);
  const bytesFromDisk = await readFile(filePath);
  const validation = await validateFile(
    new Uint8Array(bytesFromDisk.buffer, bytesFromDisk.byteOffset, bytesFromDisk.byteLength),
    EXPECTED_OBJECTS,
  );

  console.log(validation.report);
  if (validation.pass) {
    console.log(`PASS: ${EXPECTED_OBJECTS.length}/${EXPECTED_OBJECTS.length} valid`);
    process.exit(0);
  }

  console.log(`FAIL: validation failed (${EXPECTED_OBJECTS.length} expected objects)`);
  process.exit(1);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
