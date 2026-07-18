import { describe, expect, it } from 'vitest';

import type { SolidSpec } from './types';
import {
  extrusionHeight,
  placePolygonPrism,
  placePrism,
  placeSolid,
  transformPoint,
  worldAABB,
  worldBottomFace,
  worldCorners,
  type Footprint,
  type Placement,
  type Point2,
} from './placement';

const TOLERANCE = 1e-9;

const referenceSolid: SolidSpec = {
  min: [0, -0.15, 0],
  max: [1.4, 0.15, 3.0],
  type: 'wall',
  layer: 'A-WALL',
  name: 'T/p1',
};

function expectPointClose(
  actual: [number, number, number],
  expected: [number, number, number],
): void {
  expect(Math.abs(actual[0] - expected[0])).toBeLessThanOrEqual(TOLERANCE);
  expect(Math.abs(actual[1] - expected[1])).toBeLessThanOrEqual(TOLERANCE);
  expect(Math.abs(actual[2] - expected[2])).toBeLessThanOrEqual(TOLERANCE);
}

describe('placement transforms', () => {
  it('returns raw local corners for an identity placement', () => {
    const placed = placeSolid(referenceSolid, {
      rotationDeg: 0,
      origin: [0, 0, 0],
    });

    expect(worldCorners(placed)).toEqual([
      [0, -0.15, 0],
      [1.4, -0.15, 0],
      [1.4, 0.15, 0],
      [0, 0.15, 0],
      [0, -0.15, 3.0],
      [1.4, -0.15, 3.0],
      [1.4, 0.15, 3.0],
      [0, 0.15, 3.0],
    ]);
  });

  it('returns the local bounds as the world AABB for an identity placement', () => {
    const placed = placeSolid(referenceSolid, {
      rotationDeg: 0,
      origin: [0, 0, 0],
    });

    expect(worldAABB(placed)).toEqual({
      min: referenceSolid.min,
      max: referenceSolid.max,
    });
  });

  it('translates every world corner by the placement origin', () => {
    const placed = placeSolid(referenceSolid, {
      rotationDeg: 0,
      origin: [10, 20, 5],
    });
    const localCorners: [number, number, number][] = [
      [0, -0.15, 0],
      [1.4, -0.15, 0],
      [1.4, 0.15, 0],
      [0, 0.15, 0],
      [0, -0.15, 3.0],
      [1.4, -0.15, 3.0],
      [1.4, 0.15, 3.0],
      [0, 0.15, 3.0],
    ];

    worldCorners(placed).forEach((corner, index) => {
      const local = localCorners[index];
      expectPointClose(corner, [
        local[0] + 10,
        local[1] + 20,
        local[2] + 5,
      ]);
    });
  });

  it('rotates basis points 90 degrees counterclockwise', () => {
    const placement: Placement = { rotationDeg: 90, origin: [0, 0, 0] };

    expectPointClose(transformPoint([1, 0, 0], placement), [0, 1, 0]);
    expectPointClose(transformPoint([0, 1, 0], placement), [-1, 0, 0]);
  });

  it('rotates a point 180 degrees', () => {
    expectPointClose(
      transformPoint([1, 0, 0], {
        rotationDeg: 180,
        origin: [0, 0, 0],
      }),
      [-1, 0, 0],
    );
  });

  it('rotates a point 270 degrees counterclockwise', () => {
    expectPointClose(
      transformPoint([1, 0, 0], {
        rotationDeg: 270,
        origin: [0, 0, 0],
      }),
      [0, -1, 0],
    );
  });

  it('rotates basis points by 37 degrees', () => {
    const placement: Placement = { rotationDeg: 37, origin: [0, 0, 0] };

    expectPointClose(transformPoint([1, 0, 0], placement), [
      0.798635510047293,
      0.601815023152048,
      0,
    ]);
    expectPointClose(transformPoint([0, 1, 0], placement), [
      -0.601815023152048,
      0.798635510047293,
      0,
    ]);
  });

  it('does not rotate z and translates it by the origin z', () => {
    const transformed = transformPoint([1, 2, 3], {
      rotationDeg: 37,
      origin: [0, 0, 7],
    });

    expect(transformed[2]).toBe(10);
  });

  it('round trips a point through opposite 37 degree rotations', () => {
    const original: [number, number, number] = [1.4, -0.15, 2.1];
    const rotated = transformPoint(original, {
      rotationDeg: 37,
      origin: [0, 0, 0],
    });
    const roundTripped = transformPoint(rotated, {
      rotationDeg: -37,
      origin: [0, 0, 0],
    });

    expectPointClose(roundTripped, original);
  });

  it('preserves all 12 box edge lengths at 37 degrees', () => {
    const corners = worldCorners(
      placeSolid(referenceSolid, {
        rotationDeg: 37,
        origin: [3, 4, 0],
      }),
    );
    const edges: [number, number][] = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ];
    const expectedLengths = [
      1.4, 0.3, 1.4, 0.3, 1.4, 0.3, 1.4, 0.3, 3.0, 3.0, 3.0, 3.0,
    ];

    edges.forEach(([start, end], index) => {
      const a = corners[start];
      const b = corners[end];
      const length = Math.hypot(
        b[0] - a[0],
        b[1] - a[1],
        b[2] - a[2],
      );
      expect(Math.abs(length - expectedLengths[index])).toBeLessThanOrEqual(
        TOLERANCE,
      );
    });
  });

  it('preserves right angles at 37 degrees', () => {
    const corners = worldCorners(
      placeSolid(referenceSolid, {
        rotationDeg: 37,
        origin: [0, 0, 0],
      }),
    );
    const first = corners[0];
    const edgeX: [number, number, number] = [
      corners[1][0] - first[0],
      corners[1][1] - first[1],
      corners[1][2] - first[2],
    ];
    const edgeY: [number, number, number] = [
      corners[3][0] - first[0],
      corners[3][1] - first[1],
      corners[3][2] - first[2],
    ];
    const edgeZ: [number, number, number] = [
      corners[4][0] - first[0],
      corners[4][1] - first[1],
      corners[4][2] - first[2],
    ];
    const dotXY =
      edgeX[0] * edgeY[0] + edgeX[1] * edgeY[1] + edgeX[2] * edgeY[2];
    const dotXZ =
      edgeX[0] * edgeZ[0] + edgeX[1] * edgeZ[1] + edgeX[2] * edgeZ[2];
    const dotYZ =
      edgeY[0] * edgeZ[0] + edgeY[1] * edgeZ[1] + edgeY[2] * edgeZ[2];

    expect(Math.abs(dotXY)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(dotXZ)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(dotYZ)).toBeLessThanOrEqual(TOLERANCE);
  });

  it('returns the bottom face in documented order at its translated z', () => {
    const face = worldBottomFace(
      placeSolid(referenceSolid, {
        rotationDeg: 37,
        origin: [0, 0, 2],
      }),
    );
    const localBottom: [number, number, number][] = [
      [0, -0.15, 0],
      [1.4, -0.15, 0],
      [1.4, 0.15, 0],
      [0, 0.15, 0],
    ];
    const placement: Placement = { rotationDeg: 37, origin: [0, 0, 2] };

    expect(face).toHaveLength(4);
    face.forEach((point, index) => {
      expect(point[2]).toBe(referenceSolid.min[2] + placement.origin[2]);
      expectPointClose(point, transformPoint(localBottom[index], placement));
    });
  });

  it('returns the local extrusion height regardless of placement', () => {
    const placed = placeSolid(referenceSolid, {
      rotationDeg: 137,
      origin: [9, -4, 12],
    });

    expect(extrusionHeight(placed)).toBe(3.0);
  });

  it('returns eight distinct world corners at 37 degrees', () => {
    const corners = worldCorners(
      placeSolid(referenceSolid, {
        rotationDeg: 37,
        origin: [0, 0, 0],
      }),
    );

    expect(corners).toHaveLength(8);
    for (let i = 0; i < corners.length; i += 1) {
      for (let j = i + 1; j < corners.length; j += 1) {
        const distance = Math.hypot(
          corners[i][0] - corners[j][0],
          corners[i][1] - corners[j][1],
          corners[i][2] - corners[j][2],
        );
        expect(distance).toBeGreaterThan(TOLERANCE);
      }
    }
  });

  it('converts the reference box to an equivalent rectangular prism', () => {
    const placed = placeSolid(referenceSolid, {
      rotationDeg: 0,
      origin: [0, 0, 0],
    });

    expect(placed.local).toEqual({
      footprint: [
        [0, -0.15],
        [1.4, -0.15],
        [1.4, 0.15],
        [0, 0.15],
      ],
      zMin: 0,
      zMax: 3.0,
    });
  });

  it('deep-copies the source box when placing a solid', () => {
    const source: SolidSpec = {
      min: [0, -0.15, 0],
      max: [1.4, 0.15, 3.0],
      type: 'wall',
      layer: 'A-WALL',
      name: 'T/copy',
    };
    const placed = placeSolid(source, {
      rotationDeg: 0,
      origin: [0, 0, 0],
    });

    source.min[0] = 10;
    source.min[1] = 10;
    source.min[2] = 10;
    source.max[0] = 20;
    source.max[1] = 20;
    source.max[2] = 20;

    expect(placed.local).toEqual({
      footprint: [
        [0, -0.15],
        [1.4, -0.15],
        [1.4, 0.15],
        [0, 0.15],
      ],
      zMin: 0,
      zMax: 3.0,
    });
  });

  it('deep-copies the source footprint when placing a prism', () => {
    const footprint: Footprint = [
      [0, 0],
      [4, 0],
      [3, 1],
      [0, 1],
    ];
    const placed = placePrism(
      {
        type: 'wall',
        layer: 'A-WALL',
        name: 'T/prism-copy',
        footprint,
        zMin: 0,
        zMax: 3,
      },
      { rotationDeg: 0, origin: [0, 0, 0] },
    );

    footprint[0][0] = 10;
    footprint[1][1] = 10;
    footprint[2][0] = 10;
    footprint[3][1] = 10;

    expect(placed.local.footprint).toEqual([
      [0, 0],
      [4, 0],
      [3, 1],
      [0, 1],
    ]);
  });

  it('computes corners, bounds, and height for a non-rectangular prism', () => {
    const placed = placePrism(
      {
        type: 'wall',
        layer: 'A-WALL',
        name: 'T/trapezoid',
        footprint: [
          [0, 0],
          [4, 0],
          [3, 1],
          [0, 1],
        ],
        zMin: 0,
        zMax: 3,
      },
      { rotationDeg: 0, origin: [0, 0, 0] },
    );

    expect(worldCorners(placed)).toEqual([
      [0, 0, 0],
      [4, 0, 0],
      [3, 1, 0],
      [0, 1, 0],
      [0, 0, 3],
      [4, 0, 3],
      [3, 1, 3],
      [0, 1, 3],
    ]);
    expect(worldAABB(placed)).toEqual({
      min: [0, 0, 0],
      max: [4, 1, 3],
    });
    expect(extrusionHeight(placed)).toBe(3);
  });

  it('rotates a non-rectangular prism footprint 90 degrees counterclockwise', () => {
    const corners = worldCorners(
      placePrism(
        {
          type: 'wall',
          layer: 'A-WALL',
          name: 'T/rotated-trapezoid',
          footprint: [
            [0, 0],
            [4, 0],
            [3, 1],
            [0, 1],
          ],
          zMin: 0,
          zMax: 3,
        },
        { rotationDeg: 90, origin: [0, 0, 0] },
      ),
    );

    expectPointClose(corners[0], [0, 0, 0]);
    expectPointClose(corners[1], [0, 4, 0]);
  });
});

describe('placePolygonPrism', () => {
  it('places a triangle and reports 6 world corners, AABB, and height', () => {
    const placed = placePolygonPrism(
      {
        type: 'slab',
        layer: 'A-SLAB',
        name: 'S-TRI',
        footprint: [
          [0, 0],
          [4, 0],
          [0, 4],
        ],
        zMin: 0,
        zMax: 3,
      },
      { rotationDeg: 0, origin: [0, 0, 0] },
    );

    expect(worldCorners(placed)).toEqual([
      [0, 0, 0],
      [4, 0, 0],
      [0, 4, 0],
      [0, 0, 3],
      [4, 0, 3],
      [0, 4, 3],
    ]);
    expect(worldAABB(placed)).toEqual({
      min: [0, 0, 0],
      max: [4, 4, 3],
    });
    expect(extrusionHeight(placed)).toBe(3);
  });

  it('places an L-shape with 12 world corners and the expected AABB', () => {
    const placed = placePolygonPrism(
      {
        type: 'slab',
        layer: 'A-SLAB',
        name: 'S-L',
        footprint: [
          [0, 0],
          [6, 0],
          [6, 4],
          [3, 4],
          [3, 6],
          [0, 6],
        ],
        zMin: -0.25,
        zMax: 0,
      },
      { rotationDeg: 0, origin: [0, 0, 0] },
    );

    expect(worldCorners(placed)).toEqual([
      [0, 0, -0.25],
      [6, 0, -0.25],
      [6, 4, -0.25],
      [3, 4, -0.25],
      [3, 6, -0.25],
      [0, 6, -0.25],
      [0, 0, 0],
      [6, 0, 0],
      [6, 4, 0],
      [3, 4, 0],
      [3, 6, 0],
      [0, 6, 0],
    ]);
    expect(worldAABB(placed)).toEqual({
      min: [0, 0, -0.25],
      max: [6, 6, 0],
    });
  });

  it('throws on a 2-point footprint', () => {
    expect(() =>
      placePolygonPrism(
        {
          type: 'slab',
          layer: 'A-SLAB',
          name: 'S-BAD',
          footprint: [
            [0, 0],
            [1, 0],
          ],
          zMin: 0,
          zMax: 1,
        },
        { rotationDeg: 0, origin: [0, 0, 0] },
      ),
    ).toThrow(/at least 3 footprint points; received 2/);
  });

  it('deep-copies the source footprint', () => {
    const footprint: Point2[] = [
      [0, 0],
      [4, 0],
      [0, 4],
    ];
    const placed = placePolygonPrism(
      {
        type: 'slab',
        layer: 'A-SLAB',
        name: 'S-COPY',
        footprint,
        zMin: 0,
        zMax: 1,
      },
      { rotationDeg: 0, origin: [0, 0, 0] },
    );

    footprint[0][0] = 99;
    footprint[1][1] = 99;

    expect(placed.local.footprint).toEqual([
      [0, 0],
      [4, 0],
      [0, 4],
    ]);
  });

  it('rotates an L-shape 90 degrees counterclockwise', () => {
    const corners = worldCorners(
      placePolygonPrism(
        {
          type: 'slab',
          layer: 'A-SLAB',
          name: 'S-L-ROT',
          footprint: [
            [0, 0],
            [6, 0],
            [6, 4],
            [3, 4],
            [3, 6],
            [0, 6],
          ],
          zMin: -0.25,
          zMax: 0,
        },
        { rotationDeg: 90, origin: [0, 0, 0] },
      ),
    );

    expectPointClose(corners[0], [0, 0, -0.25]);
    expectPointClose(corners[1], [0, 6, -0.25]);
  });
});
