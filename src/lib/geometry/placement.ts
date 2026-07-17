import type { SolidSpec, SolidType } from './types';

export interface Placement {
  origin: [number, number, number];
  rotationDeg: number;
}

export interface PlacedSolid {
  type: SolidType;
  layer: string;
  name: string;
  local: {
    min: [number, number, number];
    max: [number, number, number];
  };
  placement: Placement;
}

export function placeSolid(
  local: SolidSpec,
  placement: Placement,
): PlacedSolid {
  return {
    type: local.type,
    layer: local.layer,
    name: local.name,
    local: {
      min: [...local.min],
      max: [...local.max],
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
  const [x0, y0, z0] = placed.local.min;
  const [x1, y1] = placed.local.max;

  return [
    transformPoint([x0, y0, z0], placed.placement),
    transformPoint([x1, y0, z0], placed.placement),
    transformPoint([x1, y1, z0], placed.placement),
    transformPoint([x0, y1, z0], placed.placement),
  ];
}

export function worldCorners(
  placed: PlacedSolid,
): [number, number, number][] {
  const bottom = worldBottomFace(placed);
  const [x0, y0] = placed.local.min;
  const [x1, y1, z1] = placed.local.max;

  return [
    ...bottom,
    transformPoint([x0, y0, z1], placed.placement),
    transformPoint([x1, y0, z1], placed.placement),
    transformPoint([x1, y1, z1], placed.placement),
    transformPoint([x0, y1, z1], placed.placement),
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
  return placed.local.max[2] - placed.local.min[2];
}
