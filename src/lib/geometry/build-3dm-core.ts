// This module holds the shared .3dm construction logic used by both the Node and browser paths.
// It must never import rhino3dm at runtime — the caller supplies the initialized module —
// because rhino3dm cannot be bundled by Turbopack.
import type rhino3dmFactory from 'rhino3dm';

import { getBBox } from './rhino-compat';
import {
  extrusionHeight,
  placeSolid,
  worldAABB,
  worldBottomFace,
} from './placement';
import type { PlacedSolid } from './placement';
import type { SolidSpec } from './types';

export type RhinoModule = Awaited<ReturnType<typeof rhino3dmFactory>>;

function approxEqual(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) <= tol;
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
    // getBoundingBox() on an Extrusion is LOOSE: it is the profile's bbox in the extrusion's own
    // plane coordinates, transformed to world. It is tight only for rectangular profiles or
    // world-aligned profile planes. Verified 2026-07-17: a 135-degree trapezoid band reported an
    // AABB 0.15*sqrt(2) too large in -x and -y while the solid itself was correct.
    // This ladder's only job is choosing extrusion DIRECTION, which affects only z, and z IS exact.
    // Geometry correctness is proven by validatePlacedFile's Brep-vertex corner check, not here.
    if (
      approxEqual(bbox.min[2], expected.min[2]) &&
      approxEqual(bbox.max[2], expected.max[2])
    ) {
      return extrusion;
    }
    diagnostics.push(
      `${attempt.label}: zRange actual=[${bbox.min[2]},${bbox.max[2]}] expected=[${expected.min[2]},${expected.max[2]}] actualAABB=${JSON.stringify({ min: bbox.min, max: bbox.max })} expectedAABB=${JSON.stringify(
        expected,
      )}`,
    );
  }

  throw new Error(
    `Extrusion bounds mismatch for ${placed.name}. Attempts: ${diagnostics.join(' | ')}`,
  );
}

// Identity placement makes the axis-aligned path a special case of the placed path; proven by spike:rot CASE A.
export function buildFile3dmWith(rhino: RhinoModule, solids: SolidSpec[]): Uint8Array {
  return buildFile3dmPlaced(
    rhino,
    solids.map((solid) => placeSolid(solid, { rotationDeg: 0, origin: [0, 0, 0] })),
  );
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
    { name: 'A-ROOF', color: { r: 120, g: 90, b: 60, a: 255 } },
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
