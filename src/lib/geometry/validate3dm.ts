import rhino3dm from 'rhino3dm';

import { getBBox } from './rhino-compat';
import { worldCorners } from './placement';
import type { PlacedSolid } from './placement';
import type { SolidSpec } from './types';

let rhinoModulePromise: ReturnType<typeof rhino3dm> | null = null;

async function getRhinoModule() {
  if (!rhinoModulePromise) {
    rhinoModulePromise = rhino3dm();
  }
  return rhinoModulePromise;
}

function withinTol(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) <= tol;
}

function formatBox(min: [number, number, number], max: [number, number, number]): string {
  return `[${min.join(',')}] -> [${max.join(',')}]`;
}

export async function validateFile(
  bytes: Uint8Array,
  expected: SolidSpec[],
): Promise<{ pass: boolean; report: string }> {
  const rhino = await getRhinoModule();
  const file = rhino.File3dm.fromByteArray(bytes);
  if (!file) {
    return { pass: false, report: 'Failed to parse 3dm bytes.' };
  }

  const objects = file.objects();
  const layers = file.layers();
  const failures: string[] = [];
  const rows: string[] = [];
  const expectedByName = new Map(expected.map((spec) => [spec.name, spec]));
  const foundByName = new Map<string, Array<{ layer: string; solid: boolean; min: number[]; max: number[] }>>();

  for (let i = 0; i < objects.count; i += 1) {
    const obj = objects.get(i);
    const attrs = obj.attributes();
    const geom = obj.geometry();
    const layer = layers.findIndex(attrs.layerIndex);
    const layerName = layer ? layer.name : '<missing-layer>';
    const bbox = getBBox(geom);

    let isSolid = false;
    if (geom.objectType === rhino.ObjectType.Extrusion) {
      const brep = (geom as unknown as { toBrep: (splitKinkyFaces: boolean) => { isSolid: boolean } | null }).toBrep(
        true,
      );
      isSolid = !!brep?.isSolid;
    } else if (geom.objectType === rhino.ObjectType.Brep) {
      isSolid = (geom as unknown as { isSolid: boolean }).isSolid;
    }

    const name = attrs.name;
    const entry = { layer: layerName, solid: isSolid, min: bbox.min, max: bbox.max };
    const arr = foundByName.get(name) ?? [];
    arr.push(entry);
    foundByName.set(name, arr);
  }

  if (objects.count !== expected.length) {
    failures.push(`Object count mismatch: expected ${expected.length}, got ${objects.count}`);
  }

  expected.forEach((spec) => {
    const found = foundByName.get(spec.name) ?? [];
    if (found.length !== 1) {
      failures.push(`Name ${spec.name} expected exactly once, found ${found.length}`);
      rows.push(`${spec.name} | FAIL | missing-or-duplicate`);
      return;
    }

    const actual = found[0];
    const layerOk = actual.layer === spec.layer;
    const solidOk = actual.solid;
    const minOk =
      withinTol(actual.min[0], spec.min[0]) &&
      withinTol(actual.min[1], spec.min[1]) &&
      withinTol(actual.min[2], spec.min[2]);
    const maxOk =
      withinTol(actual.max[0], spec.max[0]) &&
      withinTol(actual.max[1], spec.max[1]) &&
      withinTol(actual.max[2], spec.max[2]);
    const bboxOk = minOk && maxOk;
    const pass = layerOk && solidOk && bboxOk;

    rows.push(
      `${spec.name} | ${pass ? 'OK' : 'FAIL'} | layer=${actual.layer} solid=${solidOk} bbox=${formatBox(
        [actual.min[0], actual.min[1], actual.min[2]],
        [actual.max[0], actual.max[1], actual.max[2]],
      )}`,
    );

    if (!layerOk) {
      failures.push(`${spec.name}: expected layer ${spec.layer}, got ${actual.layer}`);
    }
    if (!solidOk) {
      failures.push(`${spec.name}: geometry is not a closed solid`);
    }
    if (!bboxOk) {
      failures.push(
        `${spec.name}: bbox mismatch expected ${formatBox(spec.min, spec.max)} got ${formatBox(
          [actual.min[0], actual.min[1], actual.min[2]],
          [actual.max[0], actual.max[1], actual.max[2]],
        )}`,
      );
    }
  });

  for (const [name, entries] of foundByName) {
    if (!expectedByName.has(name)) {
      failures.push(`Unexpected object in file: ${name} (${entries.length} instance(s))`);
    }
  }
  // Rhino 7 archive (70) opens in Rhino 7 and 8. A V8 archive (80) cannot be opened by Rhino 7.
  // Enforced here so a regression in write3dm.ts cannot ship an unopenable file silently.
  if (file.archiveVersion !== 70) {
    failures.push(
      `Archive version must be 70 (Rhino 7) for Rhino 7+8 compatibility, got ${file.archiveVersion}`,
    );
  }

  const reportLines = [
    `Archive version: ${file.archiveVersion}`,
    'Name | Result | Details',
    '---|---|---',
    ...rows,
  ];
  if (failures.length > 0) {
    reportLines.push('', 'Failures:');
    failures.forEach((failure) => reportLines.push(`- ${failure}`));
  }

  return { pass: failures.length === 0, report: reportLines.join('\n') };
}

export async function validatePlacedFile(
  bytes: Uint8Array,
  expected: PlacedSolid[],
): Promise<{ pass: boolean; report: string }> {
  const rhino = await getRhinoModule();
  const file = rhino.File3dm.fromByteArray(bytes);
  if (!file) {
    return { pass: false, report: 'Failed to parse 3dm bytes.' };
  }

  const objects = file.objects();
  const layers = file.layers();
  const failures: string[] = [];
  const rows: string[] = [];
  const expectedByName = new Map<string, PlacedSolid[]>();
  const foundByName = new Map<string, number[]>();

  expected.forEach((spec) => {
    const entries = expectedByName.get(spec.name) ?? [];
    entries.push(spec);
    expectedByName.set(spec.name, entries);
  });

  for (let i = 0; i < objects.count; i += 1) {
    const name = objects.get(i).attributes().name;
    const entries = foundByName.get(name) ?? [];
    entries.push(i);
    foundByName.set(name, entries);
  }

  if (file.archiveVersion !== 70) {
    failures.push(
      `Archive version must be 70 (Rhino 7) for Rhino 7+8 compatibility, got ${file.archiveVersion}`,
    );
  }
  if (objects.count !== expected.length) {
    failures.push(`Object count mismatch: expected ${expected.length}, got ${objects.count}`);
  }

  for (const [name, specs] of expectedByName) {
    if (specs.length !== 1) {
      failures.push(`Expected name ${name} must occur exactly once, found ${specs.length}`);
    }
  }

  expected.forEach((spec) => {
    const found = foundByName.get(spec.name) ?? [];
    if (found.length !== 1) {
      failures.push(`Name ${spec.name} expected exactly once, found ${found.length}`);
      rows.push(`${spec.name} | FAIL | missing-or-duplicate`);
      return;
    }

    const obj = objects.get(found[0]);
    const attrs = obj.attributes();
    const geom = obj.geometry();
    const layer = layers.findIndex(attrs.layerIndex);
    const layerName = layer ? layer.name : '<missing-layer>';
    const layerOk = layerName === spec.layer;
    const extrusionOk = geom.objectType === rhino.ObjectType.Extrusion;
    let solidOk = false;
    let cornersOk = false;
    let matchedCornerCount = 0;

    if (!layerOk) {
      failures.push(`${spec.name}: expected layer ${spec.layer}, got ${layerName}`);
    }
    if (!extrusionOk) {
      failures.push(`${spec.name}: geometry is not an Extrusion`);
    } else {
      const brep = (
        geom as unknown as {
          toBrep: (splitKinkyFaces: boolean) => {
            isSolid: boolean;
            vertices: () => {
              count: number;
              get: (index: number) => { location: number[] };
            };
          } | null;
        }
      ).toBrep(true);

      solidOk = !!brep?.isSolid;
      if (!solidOk) {
        failures.push(`${spec.name}: extrusion Brep is not a closed solid`);
      }

      if (brep) {
        const vertices = brep.vertices();
        if (typeof vertices.count !== 'number') {
          throw new Error(`${spec.name}: BrepVertexList.count is absent at runtime`);
        }
        const actualCorners: [number, number, number][] = [];
        for (let i = 0; i < vertices.count; i += 1) {
          const location = vertices.get(i).location;
          actualCorners.push([location[0], location[1], location[2]]);
        }

        if (vertices.count !== 8) {
          failures.push(`${spec.name}: expected 8 Brep vertices, got ${vertices.count}`);
        }

        const consumed = new Set<number>();
        const expectedCorners = worldCorners(spec);
        expectedCorners.forEach((corner) => {
          const matches: number[] = [];
          actualCorners.forEach((actual, index) => {
            if (
              !consumed.has(index) &&
              withinTol(actual[0], corner[0]) &&
              withinTol(actual[1], corner[1]) &&
              withinTol(actual[2], corner[2])
            ) {
              matches.push(index);
            }
          });

          if (matches.length !== 1) {
            failures.push(
              `${spec.name}: expected corner [${corner.join(',')}] had ${matches.length} matching Brep vertices`,
            );
            return;
          }

          consumed.add(matches[0]);
          matchedCornerCount += 1;
        });

        if (consumed.size !== actualCorners.length) {
          failures.push(
            `${spec.name}: ${actualCorners.length - consumed.size} Brep vertex/vertices were not consumed exactly once`,
          );
        }
        cornersOk =
          vertices.count === 8 &&
          expectedCorners.length === 8 &&
          matchedCornerCount === 8 &&
          consumed.size === actualCorners.length;
      }
    }

    const pass = layerOk && extrusionOk && solidOk && cornersOk;
    rows.push(
      `${spec.name} | ${pass ? 'OK' : 'FAIL'} | layer=${layerName} extrusion=${extrusionOk} solid=${solidOk} corners=${matchedCornerCount}/8`,
    );
  });

  for (const [name, entries] of foundByName) {
    if (!expectedByName.has(name)) {
      failures.push(`Unexpected object in file: ${name} (${entries.length} instance(s))`);
    }
  }

  const reportLines = [
    `Archive version: ${file.archiveVersion}`,
    'Name | Result | Details',
    '---|---|---',
    ...rows,
  ];
  if (failures.length > 0) {
    reportLines.push('', 'Failures:');
    failures.forEach((failure) => reportLines.push(`- ${failure}`));
  }

  return { pass: failures.length === 0, report: reportLines.join('\n') };
}
