import type { Footprint, Placement, PlacedSolid } from './placement';
import { placePrism } from './placement';
import type { SolidSpec } from './types';

export interface WallBand {
  edgeIndex: number;
  placement: Placement;
  centerlineLength: number;
  footprint: Footprint;
}

function assertValidBandFootprint(footprint: Footprint, label: string): void {
  const epsilon = 1e-9;

  let minimumPairwiseDistance = Number.POSITIVE_INFINITY;
  for (let first = 0; first < footprint.length; first += 1) {
    for (let second = first + 1; second < footprint.length; second += 1) {
      minimumPairwiseDistance = Math.min(
        minimumPairwiseDistance,
        Math.hypot(
          footprint[second][0] - footprint[first][0],
          footprint[second][1] - footprint[first][1],
        ),
      );
    }
  }

  let footprintTwiceArea = 0;
  for (let i = 0; i < footprint.length; i += 1) {
    const current = footprint[i];
    const next = footprint[(i + 1) % footprint.length];
    footprintTwiceArea +=
      current[0] * next[1] - next[0] * current[1];
  }
  const footprintArea = footprintTwiceArea / 2;
  const outerStartX = footprint[0][0];
  const outerEndX = footprint[1][0];
  const innerStartX = footprint[3][0];
  const innerEndX = footprint[2][0];

  // At a convex vertex the inner face shortens; at a reflex vertex the outer
  // face shortens — both directions must be guarded.
  if (
    !(minimumPairwiseDistance > epsilon) ||
    !(footprintArea > epsilon) ||
    !(outerStartX < outerEndX) ||
    !(innerStartX < innerEndX)
  ) {
    throw new Error(
      `Degenerate wall band at ${label}: minimum pairwise distance ${minimumPairwiseDistance}, signed area ${footprintArea}, outer start x ${outerStartX}, outer end x ${outerEndX}, inner start x ${innerStartX}, inner end x ${innerEndX}, footprint ${JSON.stringify(footprint)}.`,
    );
  }
}

export function clipBandToRange(
  footprint: Footprint,
  xLow: number,
  xHigh: number,
): Footprint {
  const epsilon = 1e-9;
  const outerY = footprint[0][1];
  const innerY = footprint[2][1];

  if (Math.abs(footprint[1][1] - outerY) > epsilon) {
    throw new Error(
      `Band long edge is not parallel to the centerline: footprint[1][1] ${footprint[1][1]} differs from outerY ${outerY}.`,
    );
  }
  if (Math.abs(footprint[3][1] - innerY) > epsilon) {
    throw new Error(
      `Band long edge is not parallel to the centerline: footprint[3][1] ${footprint[3][1]} differs from innerY ${innerY}.`,
    );
  }

  const coreLow = Math.max(footprint[0][0], footprint[3][0]);
  const coreHigh = Math.min(footprint[1][0], footprint[2][0]);

  if (xLow >= xHigh) {
    throw new Error(
      `Clip range is empty or inverted: xLow ${xLow} >= xHigh ${xHigh}.`,
    );
  }

  if (Number.isFinite(xLow)) {
    if (!(coreLow - epsilon <= xLow && xLow <= coreHigh + epsilon)) {
      throw new Error(
        `Clip boundary falls outside the band core (an opening overlapping a corner): xLow ${xLow}, coreLow ${coreLow}, coreHigh ${coreHigh}.`,
      );
    }
  }
  if (Number.isFinite(xHigh)) {
    if (!(coreLow - epsilon <= xHigh && xHigh <= coreHigh + epsilon)) {
      throw new Error(
        `Clip boundary falls outside the band core (an opening overlapping a corner): xHigh ${xHigh}, coreLow ${coreLow}, coreHigh ${coreHigh}.`,
      );
    }
  }

  const clipped: Footprint = [
    [xLow === -Infinity ? footprint[0][0] : xLow, outerY],
    [xHigh === +Infinity ? footprint[1][0] : xHigh, outerY],
    [xHigh === +Infinity ? footprint[2][0] : xHigh, innerY],
    [xLow === -Infinity ? footprint[3][0] : xLow, innerY],
  ];

  assertValidBandFootprint(clipped, `clip [${xLow}, ${xHigh}]`);
  return clipped;
}

export function placeBandSolids(
  band: WallBand,
  solids: SolidSpec[],
): PlacedSolid[] {
  const epsilon = 1e-9;
  const L = band.centerlineLength;
  const outerY = band.footprint[0][1];
  const innerY = band.footprint[2][1];

  return solids.map((solid) => {
    if (solid.min[0] < -epsilon || solid.max[0] > L + epsilon) {
      throw new Error(
        `Solid ${solid.name} lies outside the centerline span [0, ${L}]: min[0] ${solid.min[0]}, max[0] ${solid.max[0]}.`,
      );
    }
    if (Math.abs(solid.min[1] - outerY) > epsilon) {
      throw new Error(
        `Solid ${solid.name} thickness mismatch: solid.min[1] ${solid.min[1]} differs from band outerY ${outerY}.`,
      );
    }
    if (Math.abs(solid.max[1] - innerY) > epsilon) {
      throw new Error(
        `Solid ${solid.name} thickness mismatch: solid.max[1] ${solid.max[1]} differs from band innerY ${innerY}.`,
      );
    }

    const xLow =
      solid.min[0] <= epsilon ? Number.NEGATIVE_INFINITY : solid.min[0];
    const xHigh =
      solid.max[0] >= L - epsilon ? Number.POSITIVE_INFINITY : solid.max[0];
    const footprint = clipBandToRange(band.footprint, xLow, xHigh);

    return placePrism(
      {
        type: solid.type,
        layer: solid.layer,
        name: solid.name,
        footprint,
        zMin: solid.min[2],
        zMax: solid.max[2],
      },
      band.placement,
    );
  });
}

export function computeWallBands(
  outline: [number, number][],
  thickness: number | number[],
): WallBand[] {
  const epsilon = 1e-9;

  if (outline.length < 3) {
    throw new Error(
      `Wall outline must contain at least 3 points; received ${outline.length}.`,
    );
  }

  const thicknesses: number[] = Array.isArray(thickness)
    ? thickness
    : Array.from({ length: outline.length }, () => thickness);

  if (thicknesses.length !== outline.length) {
    throw new Error(
      `Wall thickness array length ${thicknesses.length} does not match outline length ${outline.length}.`,
    );
  }
  for (let i = 0; i < thicknesses.length; i += 1) {
    if (!(thicknesses[i] > 0)) {
      throw new Error(
        `Wall thickness must be greater than 0; edge ${i} received ${thicknesses[i]}.`,
      );
    }
  }

  let twiceArea = 0;
  for (let i = 0; i < outline.length; i += 1) {
    const point = outline[i];
    const next = outline[(i + 1) % outline.length];
    twiceArea += point[0] * next[1] - next[0] * point[1];
  }
  const outlineArea = twiceArea / 2;
  if (!(outlineArea > epsilon)) {
    throw new Error(
      `Wall outline must have counterclockwise winding with signed area greater than ${epsilon}; computed area ${outlineArea}.`,
    );
  }

  const directions: [number, number][] = [];
  const lengths: number[] = [];
  const outwardNormals: [number, number][] = [];
  const inwardNormals: [number, number][] = [];

  for (let i = 0; i < outline.length; i += 1) {
    const point = outline[i];
    const next = outline[(i + 1) % outline.length];
    const deltaX = next[0] - point[0];
    const deltaY = next[1] - point[1];
    const length = Math.hypot(deltaX, deltaY);

    if (length < epsilon) {
      throw new Error(
        `Wall outline edge ${i} has length ${length}, below the minimum ${epsilon}.`,
      );
    }

    const direction: [number, number] = [
      deltaX / length,
      deltaY / length,
    ];
    directions.push(direction);
    lengths.push(length);
    outwardNormals.push([direction[1], -direction[0]]);
    inwardNormals.push([-direction[1], direction[0]]);
  }

  const halfThickness = thicknesses.map((value) => value / 2);
  const outerMiters: [number, number][] = [];
  const innerMiters: [number, number][] = [];

  for (let j = 0; j < outline.length; j += 1) {
    const previousIndex = (j - 1 + outline.length) % outline.length;
    const previousDirection = directions[previousIndex];
    const nextDirection = directions[j];
    const cross =
      previousDirection[0] * nextDirection[1] -
      previousDirection[1] * nextDirection[0];
    const dot =
      previousDirection[0] * nextDirection[0] +
      previousDirection[1] * nextDirection[1];
    const vertex = outline[j];

    if (Math.abs(cross) < epsilon) {
      if (dot <= 0) {
        throw new Error(
          `Wall outline has a 180-degree reversal at vertex ${j} (cross ${cross}, dot ${dot}).`,
        );
      }

      if (
        Math.abs(halfThickness[previousIndex] - halfThickness[j]) > epsilon
      ) {
        throw new Error(
          `Wall outline has a thickness change at collinear vertex ${j} (thicknesses ${thicknesses[previousIndex]} and ${thicknesses[j]}).`,
        );
      }

      const outwardNormal = outwardNormals[j];
      const inwardNormal = inwardNormals[j];
      outerMiters.push([
        vertex[0] + outwardNormal[0] * halfThickness[j],
        vertex[1] + outwardNormal[1] * halfThickness[j],
      ]);
      innerMiters.push([
        vertex[0] + inwardNormal[0] * halfThickness[j],
        vertex[1] + inwardNormal[1] * halfThickness[j],
      ]);
      continue;
    }

    const previousOutward = outwardNormals[previousIndex];
    const nextOutward = outwardNormals[j];
    const previousOuterPoint: [number, number] = [
      vertex[0] + previousOutward[0] * halfThickness[previousIndex],
      vertex[1] + previousOutward[1] * halfThickness[previousIndex],
    ];
    const nextOuterPoint: [number, number] = [
      vertex[0] + nextOutward[0] * halfThickness[j],
      vertex[1] + nextOutward[1] * halfThickness[j],
    ];
    const outerParameter =
      ((nextOuterPoint[0] - previousOuterPoint[0]) * nextDirection[1] -
        (nextOuterPoint[1] - previousOuterPoint[1]) * nextDirection[0]) /
      cross;
    outerMiters.push([
      previousOuterPoint[0] + outerParameter * previousDirection[0],
      previousOuterPoint[1] + outerParameter * previousDirection[1],
    ]);

    const previousInward = inwardNormals[previousIndex];
    const nextInward = inwardNormals[j];
    const previousInnerPoint: [number, number] = [
      vertex[0] + previousInward[0] * halfThickness[previousIndex],
      vertex[1] + previousInward[1] * halfThickness[previousIndex],
    ];
    const nextInnerPoint: [number, number] = [
      vertex[0] + nextInward[0] * halfThickness[j],
      vertex[1] + nextInward[1] * halfThickness[j],
    ];
    const innerParameter =
      ((nextInnerPoint[0] - previousInnerPoint[0]) * nextDirection[1] -
        (nextInnerPoint[1] - previousInnerPoint[1]) * nextDirection[0]) /
      cross;
    innerMiters.push([
      previousInnerPoint[0] + innerParameter * previousDirection[0],
      previousInnerPoint[1] + innerParameter * previousDirection[1],
    ]);
  }

  return outline.map((point, edgeIndex) => {
    const direction = directions[edgeIndex];
    const rotationRadians = Math.atan2(direction[1], direction[0]);
    const cosine = Math.cos(rotationRadians);
    const sine = Math.sin(rotationRadians);
    const nextIndex = (edgeIndex + 1) % outline.length;
    const worldPoints = [
      outerMiters[edgeIndex],
      outerMiters[nextIndex],
      innerMiters[nextIndex],
      innerMiters[edgeIndex],
    ];
    const footprint = worldPoints.map(
      (worldPoint): [number, number] => {
        const deltaX = worldPoint[0] - point[0];
        const deltaY = worldPoint[1] - point[1];
        return [
          deltaX * cosine + deltaY * sine,
          -deltaX * sine + deltaY * cosine,
        ];
      },
    ) as Footprint;

    assertValidBandFootprint(footprint, `edgeIndex ${edgeIndex}`);

    const placement: Placement = {
      origin: [point[0], point[1], 0],
      rotationDeg: (rotationRadians * 180) / Math.PI,
    };

    return {
      edgeIndex,
      placement,
      centerlineLength: lengths[edgeIndex],
      footprint,
    };
  });
}
