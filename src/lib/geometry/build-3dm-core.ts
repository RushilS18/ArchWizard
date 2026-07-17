// This module holds the shared .3dm construction logic used by both the Node and browser paths.
// It must never import rhino3dm at runtime — the caller supplies the initialized module —
// because rhino3dm cannot be bundled by Turbopack.
import type rhino3dmFactory from 'rhino3dm';

import { getBBox } from './rhino-compat';
import {
  extrusionHeight,
  worldAABB,
  worldBottomFace,
  worldCorners,
} from './placement';
import type { PlacedSolid } from './placement';
import type { SolidSpec } from './types';

export type RhinoModule = Awaited<ReturnType<typeof rhino3dmFactory>>;

function approxEqual(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) <= tol;
}

function bboxMatches(
  bbox: { min: number[]; max: number[] },
  min: [number, number, number],
  max: [number, number, number],
): boolean {
  return (
    approxEqual(bbox.min[0], min[0]) &&
    approxEqual(bbox.min[1], min[1]) &&
    approxEqual(bbox.min[2], min[2]) &&
    approxEqual(bbox.max[0], max[0]) &&
    approxEqual(bbox.max[1], max[1]) &&
    approxEqual(bbox.max[2], max[2])
  );
}

function createProfileCurve(rhino: RhinoModule, solid: SolidSpec) {
  const [x0, y0, z0] = solid.min;
  const [x1, y1] = solid.max;
  const points: number[][] = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z0],
    [x0, y0, z0],
  ];
  const polyline = new rhino.Polyline(points.length);
  points.forEach((point) => {
    polyline.add(point[0], point[1], point[2]);
  });
  return polyline.toNurbsCurve();
}

function createSolidExtrusion(rhino: RhinoModule, solid: SolidSpec) {
  const height = solid.max[2] - solid.min[2];
  if (height <= 0) {
    throw new Error(`Solid ${solid.name} has non-positive height ${height}`);
  }

  const attempts: Array<{ reverse: boolean; height: number; label: string }> = [
    { reverse: false, height, label: 'fresh,+height' },
    { reverse: false, height: -height, label: 'fresh,-height' },
    { reverse: true, height, label: 'fresh-reversed,+height' },
    { reverse: true, height: -height, label: 'fresh-reversed,-height' },
  ];
  const diagnostics: string[] = [];

  for (const attempt of attempts) {
    const curve = createProfileCurve(rhino, solid);
    if (attempt.reverse) {
      curve.reverse();
    }
    const extrusion = rhino.Extrusion.create(curve, attempt.height, true);
    if (!extrusion) {
      diagnostics.push(
        `${attempt.label}: extrusion=null expected=${JSON.stringify({
          min: solid.min,
          max: solid.max,
        })}`,
      );
      continue;
    }
    const bbox = getBBox(extrusion);
    if (bboxMatches(bbox, solid.min, solid.max)) {
      return extrusion;
    }
    diagnostics.push(
      `${attempt.label}: actual=${JSON.stringify({ min: bbox.min, max: bbox.max })} expected=${JSON.stringify({
        min: solid.min,
        max: solid.max,
      })}`,
    );
  }

  throw new Error(
    `Extrusion bounds mismatch for ${solid.name}. Attempts: ${diagnostics.join(' | ')}`,
  );
}

function createPlacedProfileCurve(rhino: RhinoModule, placed: PlacedSolid) {
  const bottomFace = worldBottomFace(placed);
  const points = [...bottomFace, bottomFace[0]];
  const polyline = new rhino.Polyline(points.length);
  points.forEach((point) => {
    polyline.add(point[0], point[1], point[2]);
  });
  return polyline.toNurbsCurve();
}

function createPlacedExtrusion(rhino: RhinoModule, placed: PlacedSolid) {
  const height = extrusionHeight(placed);
  if (height <= 0) {
    throw new Error(`Solid ${placed.name} has non-positive height ${height}`);
  }

  const attempts: Array<{ reverse: boolean; height: number; label: string }> = [
    { reverse: false, height, label: 'fresh,+height' },
    { reverse: false, height: -height, label: 'fresh,-height' },
    { reverse: true, height, label: 'fresh-reversed,+height' },
    { reverse: true, height: -height, label: 'fresh-reversed,-height' },
  ];
  const diagnostics: string[] = [];
  const expected = worldAABB(placed);

  for (const attempt of attempts) {
    const curve = createPlacedProfileCurve(rhino, placed);
    if (attempt.reverse) {
      curve.reverse();
    }
    const extrusion = rhino.Extrusion.create(curve, attempt.height, true);
    if (!extrusion) {
      diagnostics.push(
        `${attempt.label}: extrusion=null expected=${JSON.stringify(expected)}`,
      );
      continue;
    }
    const bbox = getBBox(extrusion);
    if (bboxMatches(bbox, expected.min, expected.max)) {
      return extrusion;
    }
    diagnostics.push(
      `${attempt.label}: actual=${JSON.stringify({ min: bbox.min, max: bbox.max })} expected=${JSON.stringify(
        expected,
      )}`,
    );
  }

  throw new Error(
    `Extrusion bounds mismatch for ${placed.name}. Attempts: ${diagnostics.join(' | ')}`,
  );
}

export function buildFile3dmWith(rhino: RhinoModule, solids: SolidSpec[]): Uint8Array {
  const file = new rhino.File3dm();
  file.settings().modelUnitSystem = rhino.UnitSystem.Meters;

  const layerTable = file.layers();
  const layerIndices = new Map<string, number>();
  // rhino3dm's JS Layer.color setter uses the standard web convention: a: 255 = opaque.
  // (a: 0 renders layers fully invisible in Rhino 8 — verified 2026-07-09.)
  const layerDefs: Array<{ name: string; color: { r: number; g: number; b: number; a: number } }> = [
    { name: 'A-WALL', color: { r: 0, g: 0, b: 0, a: 255 } },
    { name: 'A-GLAZ', color: { r: 0, g: 150, b: 255, a: 255 } },
    { name: 'A-DOOR', color: { r: 200, g: 120, b: 0, a: 255 } },
    { name: 'A-SLAB', color: { r: 128, g: 128, b: 128, a: 255 } },
  ];

  layerDefs.forEach((def) => {
    const layer = new rhino.Layer();
    layer.name = def.name;
    layer.color = def.color;
    const index = layerTable.add(layer);
    layerIndices.set(def.name, index);
  });

  const objectTable = file.objects();
  solids.forEach((solid) => {
    const extrusion = createSolidExtrusion(rhino, solid);
    const attributes = new rhino.ObjectAttributes();
    const layerIndex = layerIndices.get(solid.layer);
    if (layerIndex === undefined) {
      throw new Error(`Missing layer ${solid.layer} for ${solid.name}`);
    }
    attributes.layerIndex = layerIndex;
    attributes.name = solid.name;
    objectTable.add(extrusion, attributes);
  });

  // Rhino 7 archive: V7 opens in Rhino 7 and 8; a V8 archive cannot be opened by Rhino 7.
  // toByteArray() defaults to the assembly major version (8) — do not use it here.
  const writeOptions = new rhino.File3dmWriteOptions();
  writeOptions.version = 7;
  return file.toByteArrayOptions(writeOptions);
}

export function buildFile3dmPlaced(rhino: RhinoModule, placed: PlacedSolid[]): Uint8Array {
  const file = new rhino.File3dm();
  file.settings().modelUnitSystem = rhino.UnitSystem.Meters;

  const layerTable = file.layers();
  const layerIndices = new Map<string, number>();
  // rhino3dm's JS Layer.color setter uses the standard web convention: a: 255 = opaque.
  // (a: 0 renders layers fully invisible in Rhino 8 — verified 2026-07-09.)
  const layerDefs: Array<{ name: string; color: { r: number; g: number; b: number; a: number } }> = [
    { name: 'A-WALL', color: { r: 0, g: 0, b: 0, a: 255 } },
    { name: 'A-GLAZ', color: { r: 0, g: 150, b: 255, a: 255 } },
    { name: 'A-DOOR', color: { r: 200, g: 120, b: 0, a: 255 } },
    { name: 'A-SLAB', color: { r: 128, g: 128, b: 128, a: 255 } },
  ];

  layerDefs.forEach((def) => {
    const layer = new rhino.Layer();
    layer.name = def.name;
    layer.color = def.color;
    const index = layerTable.add(layer);
    layerIndices.set(def.name, index);
  });

  const objectTable = file.objects();
  placed.forEach((solid) => {
    const extrusion = createPlacedExtrusion(rhino, solid);
    const attributes = new rhino.ObjectAttributes();
    const layerIndex = layerIndices.get(solid.layer);
    if (layerIndex === undefined) {
      throw new Error(`Missing layer ${solid.layer} for ${solid.name}`);
    }
    attributes.layerIndex = layerIndex;
    attributes.name = solid.name;
    objectTable.add(extrusion, attributes);
  });

  // Rhino 7 archive: V7 opens in Rhino 7 and 8; a V8 archive cannot be opened by Rhino 7.
  // toByteArray() defaults to the assembly major version (8) — do not use it here.
  const writeOptions = new rhino.File3dmWriteOptions();
  writeOptions.version = 7;
  return file.toByteArrayOptions(writeOptions);
}
