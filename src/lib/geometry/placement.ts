import type { SolidSpec, SolidType } from './types';

export interface Placement {
  origin: [number, number, number];
  rotationDeg: number;
}

export type Footprint = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
]; // 4 local-XY points, counterclockwise, in the order (x0,y0),(x1,y0),(x1,y1),(x0,y1) for a rectangle

export interface PlacedSolid {
  type: SolidType;
  layer: string;
  name: string;
  local: {
    footprint: Footprint;
    zMin: number;
    zMax: number;
  };
  placement: Placement;
}

export function placeSolid(
  local: SolidSpec,
  placement: Placement,
): PlacedSolid {
  const [x0, y0, z0] = local.min;
  const [x1, y1, z1] = local.max;

  return {
    type: local.type,
    layer: local.layer,
    name: local.name,
    local: {
      footprint: [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ],
      zMin: z0,
      zMax: z1,
    },
    placement,
  };
}

export function placePrism(
  args: {
    type: SolidType;
    layer: string;
    name: string;
    footprint: Footprint;
    zMin: number;
    zMax: number;
  },
  placement: Placement,
): PlacedSolid {
  return {
    type: args.type,
    layer: args.layer,
    name: args.name,
    local: {
      footprint: [
        [...args.footprint[0]],
        [...args.footprint[1]],
        [...args.footprint[2]],
        [...args.footprint[3]],
      ],
      zMin: args.zMin,
      zMax: args.zMax,
    },
    placement,
  };
}

export function transformPoint(
  p: [number, number, number],
  placement: Placement,
): [number, number, number] {
  const t = (placement.rotationDeg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);

  return [
    placement.origin[0] + p[0] * c - p[1] * s,
    placement.origin[1] + p[0] * s + p[1] * c,
    placement.origin[2] + p[2],
  ];
}

export function worldBottomFace(
  placed: PlacedSolid,
): [number, number, number][] {
  return placed.local.footprint.map(([x, y]) =>
    transformPoint([x, y, placed.local.zMin], placed.placement),
  );
}

export function worldCorners(
  placed: PlacedSolid,
): [number, number, number][] {
  const bottom = worldBottomFace(placed);

  return [
    ...bottom,
    ...placed.local.footprint.map(([x, y]) =>
      transformPoint([x, y, placed.local.zMax], placed.placement),
    ),
  ];
}

export function worldAABB(placed: PlacedSolid): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const corners = worldCorners(placed);
  const min: [number, number, number] = [...corners[0]];
  const max: [number, number, number] = [...corners[0]];

  for (const corner of corners.slice(1)) {
    min[0] = Math.min(min[0], corner[0]);
    min[1] = Math.min(min[1], corner[1]);
    min[2] = Math.min(min[2], corner[2]);
    max[0] = Math.max(max[0], corner[0]);
    max[1] = Math.max(max[1], corner[1]);
    max[2] = Math.max(max[2], corner[2]);
  }

  return { min, max };
}

export function extrusionHeight(placed: PlacedSolid): number {
  return placed.local.zMax - placed.local.zMin;
}
