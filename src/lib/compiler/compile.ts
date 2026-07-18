import { BuildingSpecSchema } from '../spec/building-spec';
import type { BuildingSpec } from '../spec/building-spec';
import {
  computeWallBands,
  placeBandSolids,
} from '../geometry/miter';
import type { PlacedSolid } from '../geometry/placement';
import { transformPoint } from '../geometry/placement';
import type { OpeningSpec, WallSpec } from '../geometry/types';
import { decomposeWall } from '../geometry/wall-decompose';

export interface CompileStats {
  levelCount: number;
  solidCount: number;
  wallSolids: number;
  slabSolids: number;
  roofSolids: number;
}

export type CompileResult =
  | { ok: true; solids: PlacedSolid[]; stats: CompileStats }
  | {
      ok: false;
      stage: 'validation' | 'geometry' | 'unsupported';
      reason: string;
    };

/** Shift a placed solid's local z-range by `dz` (footprint and placement unchanged). */
function offsetZ(placed: PlacedSolid, dz: number): PlacedSolid {
  return {
    type: placed.type,
    layer: placed.layer,
    name: placed.name,
    local: {
      footprint: [
        [...placed.local.footprint[0]],
        [...placed.local.footprint[1]],
        [...placed.local.footprint[2]],
        [...placed.local.footprint[3]],
      ],
      zMin: placed.local.zMin + dz,
      zMax: placed.local.zMax + dz,
    },
    placement: {
      origin: [
        placed.placement.origin[0],
        placed.placement.origin[1],
        placed.placement.origin[2],
      ],
      rotationDeg: placed.placement.rotationDeg,
    },
  };
}

function validationReason(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): string {
  const sample = issues.slice(0, 3).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${path}: ${issue.message}`;
  });
  return sample.join('; ');
}

/**
 * World-XY outer ring of the wall bands: each band's outerStart
 * (footprint[0]) transformed by that band's placement, in band order.
 * Ready for an N-gon slab/roof constructor that does not yet exist.
 */
function outerOutlineFromBands(
  bands: ReturnType<typeof computeWallBands>,
): [number, number][] {
  return bands.map((band) => {
    const [lx, ly] = band.footprint[0];
    const world = transformPoint([lx, ly, 0], band.placement);
    return [world[0], world[1]];
  });
}

function compileLevelWalls(
  data: BuildingSpec,
  levelId: string,
  floorZ: number,
): PlacedSolid[] {
  const massingForLevel = data.massing.find((m) => m.levelId === levelId);
  if (!massingForLevel) {
    throw new Error(
      `Internal invariant: missing massing for validated level ${levelId}`,
    );
  }

  const wallsForLevel = data.envelope.walls.filter((w) => w.levelId === levelId);
  const outline = massingForLevel.outline;
  const thicknesses = wallsForLevel.map((w) => w.thickness);
  const bands = computeWallBands(outline, thicknesses);

  if (bands.length !== wallsForLevel.length) {
    throw new Error(
      `Internal invariant: band count ${bands.length} !== wall count ${wallsForLevel.length}`,
    );
  }

  const placed: PlacedSolid[] = [];

  for (let i = 0; i < bands.length; i += 1) {
    const wall = wallsForLevel[i];
    const band = bands[i];
    const openingsForWall = data.openings.filter(
      (o) => o.hostWallId === wall.id,
    );

    const openings: OpeningSpec[] = openingsForWall.map((o) => ({
      id: o.id,
      kind: o.kind,
      xStart: o.position,
      width: o.width,
      sill: o.sill,
      head: o.head,
    }));

    const wallSpec: WallSpec = {
      id: wall.id,
      xStart: 0,
      xEnd: band.centerlineLength,
      y: 0,
      thickness: wall.thickness,
      baseZ: 0,
      height: wall.height,
      openings,
    };

    const solids = decomposeWall(wallSpec);
    const bandPlaced = placeBandSolids(band, solids);
    for (const solid of bandPlaced) {
      placed.push(offsetZ(solid, floorZ));
    }
  }

  // Outer outline computed so callers/tests can see the intended slab ring;
  // construction is blocked below until an N-gon PlacedSolid API exists.
  void outerOutlineFromBands(bands);

  return placed;
}

export function compile(spec: unknown): CompileResult {
  const parsed = BuildingSpecSchema.safeParse(spec);
  if (!parsed.success) {
    return {
      ok: false,
      stage: 'validation',
      reason: validationReason(parsed.error.issues),
    };
  }

  const data = parsed.data;

  if (data.levels.length !== 1) {
    return {
      ok: false,
      stage: 'unsupported',
      reason: 'multi-level not yet supported (2d-ii)',
    };
  }

  if (data.envelope.roof.type === 'pitched') {
    return {
      ok: false,
      stage: 'unsupported',
      reason: 'pitched roof not supported in Stage 1',
    };
  }

  try {
    const level = data.levels[0];
    const floorZ = level.elevation;

    // Steps 5–7: wall poché only (no glazing / door-leaf solids in Stage 1).
    const wallSolids = compileLevelWalls(data, level.id, floorZ);

    // Step 8 — SLAB: need an N-gon PlacedSolid constructor.
    // placePrism / PlacedSolid.local.footprint are hard-typed to 4 points.
    // placement.ts must not be modified from this module's scope.
    // Schema field is `envelope.slabs[].thickness` (not `depth` as in the task brief).
    const slabsForLevel = data.envelope.slabs.filter(
      (s) => s.levelId === level.id,
    );
    if (slabsForLevel.length === 0) {
      return {
        ok: false,
        stage: 'geometry',
        reason: `No slab entry for level ${level.id}`,
      };
    }
    void slabsForLevel[0]; // depth/thickness and outer outline ready once placePolygon exists
    void wallSolids;

    // Step 9 — ROOF (flat): same N-gon constructor gap as the slab.
    void data.envelope.roof;

    return {
      ok: false,
      stage: 'unsupported',
      reason:
        'N-gon PlacedSolid constructor missing: placePrism/Footprint are 4-point only; slab and flat roof need placePolygon (or equivalent) before compile can finish',
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { ok: false, stage: 'geometry', reason: error.message };
    }
    throw error;
  }
}
