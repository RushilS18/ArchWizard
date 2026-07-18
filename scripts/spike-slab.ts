import { mkdir, readFile, writeFile } from 'node:fs/promises';

import rhino3dm from 'rhino3dm';

import { getBBox } from '../src/lib/geometry/rhino-compat';

type RhinoModule = Awaited<ReturnType<typeof rhino3dm>>;

type ExtrusionBrep = {
  isSolid: boolean;
  vertices: () => {
    count: number;
    get: (index: number) => { location: number[] };
  };
};

let rhinoModulePromise: ReturnType<typeof rhino3dm> | null = null;

async function getRhinoModule(): Promise<RhinoModule> {
  if (!rhinoModulePromise) {
    rhinoModulePromise = rhino3dm();
  }
  return rhinoModulePromise;
}

const OUTLINE: [number, number][] = [
  [0, 0],
  [6, 0],
  [6, 4],
  [3, 4],
  [3, 6],
  [0, 6],
];
const zBottom = -0.25;
const zTop = 0;
const TOL = 1e-6;

function approxEqual(a: number, b: number, tol = TOL): boolean {
  return Math.abs(a - b) <= tol;
}

function withinTol(a: number, b: number, tol = TOL): boolean {
  return Math.abs(a - b) <= tol;
}

function createProfileCurve(rhino: RhinoModule, z: number) {
  const points: [number, number, number][] = [
    ...OUTLINE.map(([x, y]): [number, number, number] => [x, y, z]),
    [OUTLINE[0][0], OUTLINE[0][1], z],
  ];
  const polyline = new rhino.Polyline(points.length);
  points.forEach((point) => {
    polyline.add(point[0], point[1], point[2]);
  });
  return polyline.toNurbsCurve();
}

function extrusionToBrep(geom: object): ExtrusionBrep | null {
  return (
    geom as unknown as {
      toBrep: (splitKinkyFaces: boolean) => ExtrusionBrep | null;
    }
  ).toBrep(true);
}

function createSlabExtrusion(rhino: RhinoModule) {
  const height = zTop - zBottom;
  const attempts: Array<{ height: number; label: string }> = [
    { height, label: '+height' },
    { height: -height, label: '-height' },
  ];
  const diagnostics: string[] = [];

  for (const attempt of attempts) {
    const curve = createProfileCurve(rhino, zBottom);
    const extrusion = rhino.Extrusion.create(curve, attempt.height, true);
    if (!extrusion) {
      diagnostics.push(`${attempt.label}: extrusion=null`);
      continue;
    }
    const bbox = getBBox(extrusion);
    if (approxEqual(bbox.min[2], zBottom) && approxEqual(bbox.max[2], zTop)) {
      return extrusion;
    }
    diagnostics.push(
      `${attempt.label}: zRange actual=[${bbox.min[2]},${bbox.max[2]}] expected=[${zBottom},${zTop}]`,
    );
  }

  throw new Error(
    `Slab extrusion z-range mismatch. Attempts: ${diagnostics.join(' | ')}`,
  );
}

function expectedCorners(): [number, number, number][] {
  const bottom = OUTLINE.map(
    ([x, y]): [number, number, number] => [x, y, zBottom],
  );
  const top = OUTLINE.map(([x, y]): [number, number, number] => [x, y, zTop]);
  return [...bottom, ...top];
}

function writeSlabFile(
  rhino: RhinoModule,
  extrusion: InstanceType<RhinoModule['Extrusion']>,
): Uint8Array {
  const file = new rhino.File3dm();
  file.settings().modelUnitSystem = rhino.UnitSystem.Meters;

  const layer = new rhino.Layer();
  layer.name = 'A-SLAB';
  layer.color = { r: 128, g: 128, b: 128, a: 255 };
  const layerIndex = file.layers().add(layer);

  const attributes = new rhino.ObjectAttributes();
  attributes.name = 'S-CONCAVE';
  attributes.layerIndex = layerIndex;
  file.objects().add(extrusion, attributes);

  const writeOptions = new rhino.File3dmWriteOptions();
  writeOptions.version = 7;
  return file.toByteArrayOptions(writeOptions);
}

async function main() {
  console.log('=== SLAB SPIKE — CONCAVE L-OUTLINE EXTRUSION ===');

  const rhino = await getRhinoModule();
  const extrusion = createSlabExtrusion(rhino);
  if (!extrusion) {
    throw new Error('createSlabExtrusion returned null');
  }

  const buildBrep = extrusionToBrep(extrusion);
  if (!buildBrep?.isSolid) {
    throw new Error('Concave slab Extrusion.toBrep(true).isSolid is not true');
  }

  await mkdir('artifacts', { recursive: true });
  const bytes = writeSlabFile(rhino, extrusion);
  const filePath = 'artifacts/spike-slab.3dm';
  await writeFile(filePath, bytes);

  const bytesFromDisk = await readFile(filePath);
  const file = rhino.File3dm.fromByteArray(
    new Uint8Array(
      bytesFromDisk.buffer,
      bytesFromDisk.byteOffset,
      bytesFromDisk.byteLength,
    ),
  );
  if (!file) {
    throw new Error('Failed to parse spike-slab.3dm from disk');
  }

  console.log(`archiveVersion: ${file.archiveVersion}`);
  if (file.archiveVersion !== 70) {
    throw new Error(`Expected archiveVersion 70, got ${file.archiveVersion}`);
  }

  const objects = file.objects();
  const layers = file.layers();
  if (objects.count !== 1) {
    throw new Error(`Expected exactly 1 object, got ${objects.count}`);
  }

  const obj = objects.get(0);
  const attrs = obj.attributes();
  const geom = obj.geometry();
  const layer = layers.findIndex(attrs.layerIndex);
  const layerName = layer ? layer.name : '<missing-layer>';

  const nameOk = attrs.name === 'S-CONCAVE';
  const layerOk = layerName === 'A-SLAB';
  const extrusionOk = geom.objectType === rhino.ObjectType.Extrusion;

  if (!nameOk) {
    throw new Error(`Expected name S-CONCAVE, got ${attrs.name}`);
  }
  if (!layerOk) {
    throw new Error(`Expected layer A-SLAB, got ${layerName}`);
  }
  if (!extrusionOk) {
    throw new Error(`Expected ObjectType.Extrusion, got ${String(geom.objectType)}`);
  }

  const brep = extrusionToBrep(geom);
  const solidOk = !!brep?.isSolid;
  if (!brep) {
    throw new Error('Read-back Extrusion.toBrep(true) returned null');
  }
  if (!solidOk) {
    throw new Error('Read-back Extrusion.toBrep(true).isSolid is not true');
  }

  const vertices = brep.vertices();
  if (typeof vertices.count !== 'number') {
    throw new Error('BrepVertexList.count is absent at runtime');
  }

  const actualCorners: [number, number, number][] = [];
  for (let i = 0; i < vertices.count; i += 1) {
    const location = vertices.get(i).location;
    actualCorners.push([location[0], location[1], location[2]]);
  }

  console.log(`Brep vertex count (actual): ${vertices.count}`);

  const expected = expectedCorners();
  const cornerRows: string[] = [];
  const matchedVertexIndices = new Set<number>();
  let allCornersMatched = true;

  expected.forEach((corner, cornerIndex) => {
    const matches: number[] = [];
    actualCorners.forEach((actual, index) => {
      if (
        withinTol(actual[0], corner[0]) &&
        withinTol(actual[1], corner[1]) &&
        withinTol(actual[2], corner[2])
      ) {
        matches.push(index);
      }
    });

    const ok = matches.length === 1;
    if (!ok) {
      allCornersMatched = false;
      cornerRows.push(
        `corner[${cornerIndex}] [${corner.join(',')}] FAIL matches=${matches.length}`,
      );
      return;
    }

    matchedVertexIndices.add(matches[0]);
    cornerRows.push(
      `corner[${cornerIndex}] [${corner.join(',')}] OK -> vertex[${matches[0]}]`,
    );
  });

  cornerRows.forEach((row) => console.log(row));

  const surplus: [number, number, number][] = [];
  actualCorners.forEach((actual, index) => {
    if (!matchedVertexIndices.has(index)) {
      surplus.push(actual);
    }
  });
  if (surplus.length > 0) {
    console.log(
      `Surplus Brep vertices (${surplus.length}): ${JSON.stringify(surplus)}`,
    );
  }

  if (vertices.count < expected.length) {
    allCornersMatched = false;
    console.log(
      `FAIL: Brep has fewer vertices than expected corners (${vertices.count} < ${expected.length})`,
    );
  }

  const pass = solidOk && allCornersMatched;
  console.log(`isSolid: ${solidOk}`);
  console.log(`corners matched: ${matchedVertexIndices.size}/${expected.length}`);
  console.log(`SLAB SPIKE: ${pass ? 'PASS' : 'FAIL'}`);
  process.exit(pass ? 0 : 1);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
