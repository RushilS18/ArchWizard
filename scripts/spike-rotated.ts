import { mkdir, readFile, writeFile } from 'node:fs/promises';

import rhino3dm from 'rhino3dm';

import { buildFile3dmPlaced } from '../src/lib/geometry/build-3dm-core';
import { placeSolid } from '../src/lib/geometry/placement';
import type { Placement, PlacedSolid } from '../src/lib/geometry/placement';
import type { SolidSpec, WallSpec } from '../src/lib/geometry/types';
import { validatePlacedFile } from '../src/lib/geometry/validate3dm';
import { decomposeWall } from '../src/lib/geometry/wall-decompose';

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

let rhinoModulePromise: ReturnType<typeof rhino3dm> | null = null;

async function buildPlacedFile(placed: PlacedSolid[]): Promise<Uint8Array> {
  if (!rhinoModulePromise) {
    rhinoModulePromise = rhino3dm();
  }
  const rhino = await rhinoModulePromise;
  return buildFile3dmPlaced(rhino, placed);
}

async function runCase(
  header: string,
  placement: Placement,
  filePath: string,
  solids: SolidSpec[],
): Promise<boolean> {
  const placed = solids.map((solid) => placeSolid(solid, placement));
  const bytes = await buildPlacedFile(placed);
  await writeFile(filePath, bytes);
  const bytesFromDisk = await readFile(filePath);
  const validation = await validatePlacedFile(
    new Uint8Array(bytesFromDisk.buffer, bytesFromDisk.byteOffset, bytesFromDisk.byteLength),
    placed,
  );

  console.log(`\n=== ${header} ===`);
  console.log(validation.report);
  console.log(
    validation.pass
      ? `PASS: ${placed.length}/${placed.length} corner-validated`
      : `FAIL: validation failed (${placed.length} expected objects)`,
  );
  return validation.pass;
}

async function main() {
  const wallSolids = decomposeWall(wall);
  const allSolids = [...wallSolids, ...literalSolids];

  await mkdir('artifacts', { recursive: true });
  const zeroPass = await runCase(
    'CASE A — ZERO-ROTATION REGRESSION',
    { rotationDeg: 0, origin: [0, 0, 0] },
    'artifacts/spike-rotated-0.3dm',
    allSolids,
  );
  const rotatedPass = await runCase(
    'CASE B — ROTATED 37 DEGREES',
    { rotationDeg: 37, origin: [3, 4, 0] },
    'artifacts/spike-rotated-37.3dm',
    allSolids,
  );

  const rotatedBytesFromDisk = await readFile('artifacts/spike-rotated-37.3dm');
  const wrongPlaced = allSolids.map((solid) =>
    placeSolid(solid, { rotationDeg: 38, origin: [3, 4, 0] }),
  );
  const negativeValidation = await validatePlacedFile(
    new Uint8Array(
      rotatedBytesFromDisk.buffer,
      rotatedBytesFromDisk.byteOffset,
      rotatedBytesFromDisk.byteLength,
    ),
    wrongPlaced,
  );
  console.log('\n=== CASE C — NEGATIVE TEST (38deg expectation vs 37deg file) ===');
  console.log(negativeValidation.report);
  console.log(
    negativeValidation.pass
      ? 'CASE C: DID NOT FAIL — validator is not detecting wrong corners'
      : 'CASE C: correctly rejected wrong geometry',
  );
  const negativePass = !negativeValidation.pass;

  const pass = zeroPass && rotatedPass && negativePass;
  console.log(`\nROTATION SPIKE: ${pass ? 'PASS' : 'FAIL'}`);
  process.exit(pass ? 0 : 1);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
