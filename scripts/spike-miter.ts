import { mkdir, readFile, writeFile } from 'node:fs/promises';

import rhino3dm from 'rhino3dm';

import { buildFile3dmPlaced } from '../src/lib/geometry/build-3dm-core';
import { computeWallBands } from '../src/lib/geometry/miter';
import {
  placePrism,
  worldCorners,
} from '../src/lib/geometry/placement';
import type { PlacedSolid } from '../src/lib/geometry/placement';
import { validatePlacedFile } from '../src/lib/geometry/validate3dm';

let rhinoModulePromise: ReturnType<typeof rhino3dm> | null = null;

async function buildPlacedFile(placed: PlacedSolid[]): Promise<Uint8Array> {
  if (!rhinoModulePromise) {
    rhinoModulePromise = rhino3dm();
  }
  const rhino = await rhinoModulePromise;
  return buildFile3dmPlaced(rhino, placed);
}

function bandsToPlaced(
  outline: [number, number][],
  thickness: number,
  zMin: number,
  zMax: number,
): PlacedSolid[] {
  const bands = computeWallBands(outline, thickness);
  return bands.map((band) =>
    placePrism(
      {
        type: 'wall',
        layer: 'A-WALL',
        name: `W-${String(band.edgeIndex + 1).padStart(2, '0')}`,
        footprint: band.footprint,
        zMin,
        zMax,
      },
      band.placement,
    ),
  );
}

function assertW01HardcodedCorners(placed: PlacedSolid[]): void {
  const w01 = placed.find((solid) => solid.name === 'W-01');
  if (!w01) {
    throw new Error('Expected placed solid named W-01');
  }

  const expected: [number, number, number][] = [
    [-0.15, -0.15, 0],
    [6.15, -0.15, 0],
    [5.85, 0.15, 0],
    [0.15, 0.15, 0],
    [-0.15, -0.15, 3],
    [6.15, -0.15, 3],
    [5.85, 0.15, 3],
    [0.15, 0.15, 3],
  ];
  const actual = worldCorners(w01);
  const tol = 1e-9;

  const unmatchedExpected = expected.filter(
    (exp) =>
      !actual.some(
        (act) =>
          Math.abs(act[0] - exp[0]) <= tol &&
          Math.abs(act[1] - exp[1]) <= tol &&
          Math.abs(act[2] - exp[2]) <= tol,
      ),
  );
  const unmatchedActual = actual.filter(
    (act) =>
      !expected.some(
        (exp) =>
          Math.abs(act[0] - exp[0]) <= tol &&
          Math.abs(act[1] - exp[1]) <= tol &&
          Math.abs(act[2] - exp[2]) <= tol,
      ),
  );

  if (
    actual.length !== expected.length ||
    unmatchedExpected.length > 0 ||
    unmatchedActual.length > 0
  ) {
    throw new Error(
      `W-01 hardcoded corner mismatch. expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)} unmatchedExpected=${JSON.stringify(unmatchedExpected)} unmatchedActual=${JSON.stringify(unmatchedActual)}`,
    );
  }

  console.log('W-01 hardcoded corner anchor: OK');
}

async function runCase(
  header: string,
  outline: [number, number][],
  thickness: number,
  zMin: number,
  zMax: number,
  filePath: string,
  options?: { assertW01Anchor?: boolean },
): Promise<boolean> {
  const placed = bandsToPlaced(outline, thickness, zMin, zMax);

  if (options?.assertW01Anchor) {
    assertW01HardcodedCorners(placed);
  }

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
  await mkdir('artifacts', { recursive: true });

  const rectOutline: [number, number][] = [
    [0, 0],
    [6, 0],
    [6, 4],
    [0, 4],
  ];
  const triOutline: [number, number][] = [
    [0, 0],
    [4, 0],
    [0, 4],
  ];

  const caseAPass = await runCase(
    'CASE A — RECTANGLE 6x4',
    rectOutline,
    0.3,
    0,
    3.0,
    'artifacts/spike-miter-rect.3dm',
    { assertW01Anchor: true },
  );

  const caseBPass = await runCase(
    'CASE B — RIGHT ISOSCELES TRIANGLE',
    triOutline,
    0.3,
    0,
    3.0,
    'artifacts/spike-miter-tri.3dm',
  );

  const rectBytesFromDisk = await readFile('artifacts/spike-miter-rect.3dm');
  const wrongPlaced = bandsToPlaced(rectOutline, 0.35, 0, 3.0);
  const negativeValidation = await validatePlacedFile(
    new Uint8Array(
      rectBytesFromDisk.buffer,
      rectBytesFromDisk.byteOffset,
      rectBytesFromDisk.byteLength,
    ),
    wrongPlaced,
  );
  console.log('\n=== CASE C — NEGATIVE TEST (0.35 expectation vs 0.3 file) ===');
  console.log(negativeValidation.report);
  console.log(
    negativeValidation.pass
      ? 'CASE C: DID NOT FAIL — validator is not detecting wrong corners'
      : 'CASE C: correctly rejected wrong geometry',
  );
  const caseCPass = !negativeValidation.pass;

  const pass = caseAPass && caseBPass && caseCPass;
  console.log(`\nMITER SPIKE: ${pass ? 'PASS' : 'FAIL'}`);
  process.exit(pass ? 0 : 1);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
