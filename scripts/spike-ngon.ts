import { mkdir, readFile, writeFile } from 'node:fs/promises';

import rhino3dm from 'rhino3dm';

import { buildFile3dmPlaced } from '../src/lib/geometry/build-3dm-core';
import { placePolygonPrism } from '../src/lib/geometry/placement';
import type { PlacedSolid } from '../src/lib/geometry/placement';
import { validatePlacedFile } from '../src/lib/geometry/validate3dm';

type RhinoModule = Awaited<ReturnType<typeof rhino3dm>>;

let rhinoModulePromise: ReturnType<typeof rhino3dm> | null = null;

async function getRhinoModule(): Promise<RhinoModule> {
  if (!rhinoModulePromise) {
    rhinoModulePromise = rhino3dm();
  }
  return rhinoModulePromise;
}

const L_FOOTPRINT: [number, number][] = [
  [0, 0],
  [6, 0],
  [6, 4],
  [3, 4],
  [3, 6],
  [0, 6],
];

function makeLSlab(zMax: number): PlacedSolid {
  return placePolygonPrism(
    {
      type: 'slab',
      layer: 'A-SLAB',
      name: 'S-NGON',
      footprint: L_FOOTPRINT,
      zMin: -0.25,
      zMax,
    },
    { rotationDeg: 0, origin: [0, 0, 0] },
  );
}

async function main() {
  console.log('=== NGON SPIKE — placePolygonPrism -> buildFile3dmPlaced -> validatePlacedFile ===');

  const rhino = await getRhinoModule();
  const placed = makeLSlab(0);
  const expectedCornerCount = 2 * placed.local.footprint.length;

  const bytes = buildFile3dmPlaced(rhino, [placed]);
  await mkdir('artifacts', { recursive: true });
  const filePath = 'artifacts/spike-ngon.3dm';
  await writeFile(filePath, bytes);

  const bytesFromDisk = await readFile(filePath);
  const fileBytes = new Uint8Array(
    bytesFromDisk.buffer,
    bytesFromDisk.byteOffset,
    bytesFromDisk.byteLength,
  );

  const positive = await validatePlacedFile(fileBytes, [placed]);
  console.log(positive.report);

  const archiveMatch = positive.report.match(/Archive version: (\d+)/);
  const archiveVersion = archiveMatch ? Number(archiveMatch[1]) : -1;
  const cornerMatch = positive.report.match(/corners=(\d+)\/(\d+)/);
  const matched = cornerMatch ? Number(cornerMatch[1]) : -1;
  const expectedPrinted = cornerMatch ? Number(cornerMatch[2]) : -1;

  console.log(`archiveVersion: ${archiveVersion}`);
  console.log(`actual vertex count (expected 2N): ${expectedCornerCount}`);
  console.log(`corners matched: ${matched}/${expectedPrinted}`);

  const wrongExpectation = makeLSlab(0.1);
  const negative = await validatePlacedFile(fileBytes, [wrongExpectation]);
  if (negative.pass === false) {
    console.log('NGON CASE NEG: correctly rejected');
  } else {
    console.log('NGON CASE NEG: FAIL — wrong expectation was accepted');
  }

  const pass =
    positive.pass &&
    negative.pass === false &&
    archiveVersion === 70 &&
    expectedCornerCount === 12 &&
    matched === 12 &&
    expectedPrinted === 12;

  console.log(`NGON SPIKE: ${pass ? 'PASS' : 'FAIL'}`);
  process.exit(pass ? 0 : 1);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
