import { describe, expect, it } from 'vitest';

import {
  clipBandToRange,
  computeWallBands,
  placeBandSolids,
} from './miter';
import type { WallSpec } from './types';
import { decomposeWall } from './wall-decompose';

const tolerance = 1e-9;

function expectPoint(
  actual: readonly number[],
  expected: readonly number[],
): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((component, index) => {
    expect(Math.abs(actual[index] - component)).toBeLessThanOrEqual(tolerance);
  });
}

describe('computeWallBands', () => {
  it('computes mitered bands for a rectangle', () => {
    const bands = computeWallBands(
      [
        [0, 0],
        [6, 0],
        [6, 4],
        [0, 4],
      ],
      0.3,
    );

    expect(bands).toHaveLength(4);

    expectPoint(bands[0].placement.origin, [0, 0, 0]);
    expect(bands[0].placement.rotationDeg).toBe(0);
    expect(bands[0].centerlineLength).toBe(6);
    [
      [-0.15, -0.15],
      [6.15, -0.15],
      [5.85, 0.15],
      [0.15, 0.15],
    ].forEach((point, index) => {
      expectPoint(bands[0].footprint[index], point);
    });

    expectPoint(bands[1].placement.origin, [6, 0, 0]);
    expect(bands[1].placement.rotationDeg).toBe(90);
    expect(bands[1].centerlineLength).toBe(4);
    [
      [-0.15, -0.15],
      [4.15, -0.15],
      [3.85, 0.15],
      [0.15, 0.15],
    ].forEach((point, index) => {
      expectPoint(bands[1].footprint[index], point);
    });
  });

  it('keeps rectangle outer and inner faces at their local offsets', () => {
    const bands = computeWallBands(
      [
        [0, 0],
        [6, 0],
        [6, 4],
        [0, 4],
      ],
      0.3,
    );

    bands.forEach((band) => {
      expectPoint(
        [band.footprint[0][1], band.footprint[1][1]],
        [-0.15, -0.15],
      );
      expectPoint(
        [band.footprint[2][1], band.footprint[3][1]],
        [0.15, 0.15],
      );
    });
  });

  it('computes the acute miter extension for a right isosceles triangle', () => {
    const bands = computeWallBands(
      [
        [0, 0],
        [4, 0],
        [0, 4],
      ],
      0.3,
    );

    expect(bands).toHaveLength(3);
    expectPoint(bands[0].placement.origin, [0, 0, 0]);
    expect(bands[0].placement.rotationDeg).toBe(0);
    expect(bands[0].centerlineLength).toBe(4);
    [
      [-0.15, -0.15],
      [4.362132034355964, -0.15],
      [3.637867965644036, 0.15],
      [0.15, 0.15],
    ].forEach((point, index) => {
      expectPoint(bands[0].footprint[index], point);
    });
  });

  it('uses zero extension at a same-direction collinear vertex', () => {
    const bands = computeWallBands(
      [
        [0, 0],
        [3, 0],
        [6, 0],
        [6, 4],
        [0, 4],
      ],
      0.3,
    );

    expect(bands).toHaveLength(5);
    [
      [-0.15, -0.15],
      [3, -0.15],
      [3, 0.15],
      [0.15, 0.15],
    ].forEach((point, index) => {
      expectPoint(bands[0].footprint[index], point);
    });
  });

  it('rejects clockwise input', () => {
    expect(() =>
      computeWallBands(
        [
          [0, 0],
          [0, 4],
          [6, 4],
          [6, 0],
        ],
        0.3,
      ),
    ).toThrow(/winding|area/i);
  });

  it('rejects a sliver whose miter extension exceeds an edge', () => {
    expect(() =>
      computeWallBands(
        [
          [0, 0],
          [1, 0],
          [0.5, 0.05],
        ],
        0.3,
      ),
    ).toThrow();
  });

  it('rejects zero thickness and outlines with fewer than three points', () => {
    expect(() =>
      computeWallBands(
        [
          [0, 0],
          [1, 0],
          [0, 1],
        ],
        0,
      ),
    ).toThrow(/thickness/i);
    expect(() =>
      computeWallBands(
        [
          [0, 0],
          [1, 0],
        ],
        0.3,
      ),
    ).toThrow(/at least 3/i);
  });

  it('computes valid bands for a concave L-shaped polygon', () => {
    const bands = computeWallBands(
      [
        [0, 0],
        [6, 0],
        [6, 4],
        [3, 4],
        [3, 2],
        [0, 2],
      ],
      0.3,
    );

    expect(bands).toHaveLength(6);
    bands.forEach((band) => {
      expectPoint(
        [band.footprint[0][1], band.footprint[1][1]],
        [-0.15, -0.15],
      );
      expectPoint(
        [band.footprint[2][1], band.footprint[3][1]],
        [0.15, 0.15],
      );

      let twiceArea = 0;
      for (let index = 0; index < band.footprint.length; index += 1) {
        const point = band.footprint[index];
        const next = band.footprint[(index + 1) % band.footprint.length];
        twiceArea += point[0] * next[1] - next[0] * point[1];
      }
      expect(twiceArea / 2).toBeGreaterThan(0);
    });
  });

  it('rejects an inverted outer edge between two reflex vertices', () => {
    expect(() =>
      computeWallBands(
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [4.1, 10],
          [4.1, 4],
          [4, 4],
          [4, 10],
          [0, 10],
        ],
        0.3,
      ),
    ).toThrow(/edgeIndex 4/);
  });

  it('accepts the same slot geometry when the slot is wide enough', () => {
    expect(() => {
      const bands = computeWallBands(
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [5, 10],
          [5, 4],
          [4, 4],
          [4, 10],
          [0, 10],
        ],
        0.3,
      );

      expect(bands).toHaveLength(8);
      bands.forEach((band) => {
        expectPoint(
          [band.footprint[0][1], band.footprint[1][1]],
          [-0.15, -0.15],
        );
        expectPoint(
          [band.footprint[2][1], band.footprint[3][1]],
          [0.15, 0.15],
        );
      });
    }).not.toThrow();
  });
});

const referenceWall: WallSpec = {
  id: 'W-01',
  xStart: 0,
  xEnd: 6,
  y: 0,
  thickness: 0.3,
  baseZ: 0,
  height: 3.0,
  openings: [
    {
      id: 'win1',
      kind: 'window',
      xStart: 1.4,
      width: 1.2,
      sill: 0.9,
      head: 2.1,
    },
    {
      id: 'dr1',
      kind: 'door',
      xStart: 3.8,
      width: 0.9,
      sill: 0,
      head: 2.1,
    },
  ],
};

function referenceBand0() {
  return computeWallBands(
    [
      [0, 0],
      [6, 0],
      [6, 4],
      [0, 4],
    ],
    0.3,
  )[0];
}

describe('clipBandToRange', () => {
  it('keeps the start miter when clipping with -Infinity', () => {
    const band0 = referenceBand0();
    const clipped = clipBandToRange(
      band0.footprint,
      Number.NEGATIVE_INFINITY,
      1.4,
    );
    [
      [-0.15, -0.15],
      [1.4, -0.15],
      [1.4, 0.15],
      [0.15, 0.15],
    ].forEach((point, index) => {
      expectPoint(clipped[index], point);
    });
  });

  it('clips an interior range to a plain rectangle', () => {
    const band0 = referenceBand0();
    const clipped = clipBandToRange(band0.footprint, 1.4, 2.6);
    [
      [1.4, -0.15],
      [2.6, -0.15],
      [2.6, 0.15],
      [1.4, 0.15],
    ].forEach((point, index) => {
      expectPoint(clipped[index], point);
    });
  });

  it('keeps the end miter when clipping with +Infinity', () => {
    const band0 = referenceBand0();
    const clipped = clipBandToRange(
      band0.footprint,
      4.7,
      Number.POSITIVE_INFINITY,
    );
    [
      [4.7, -0.15],
      [6.15, -0.15],
      [5.85, 0.15],
      [4.7, 0.15],
    ].forEach((point, index) => {
      expectPoint(clipped[index], point);
    });
  });

  it('returns the band footprint unchanged for a full-range clip', () => {
    const band0 = referenceBand0();
    const clipped = clipBandToRange(
      band0.footprint,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    );
    band0.footprint.forEach((point, index) => {
      expectPoint(clipped[index], point);
    });
  });

  it('throws when xLow falls below the band core', () => {
    const band0 = referenceBand0();
    expect(() => clipBandToRange(band0.footprint, 0.1, 2.0)).toThrow(/core/i);
  });

  it('throws when xHigh falls above the band core', () => {
    const band0 = referenceBand0();
    expect(() => clipBandToRange(band0.footprint, 2.0, 5.9)).toThrow(/core/i);
  });

  it('throws when xLow >= xHigh', () => {
    const band0 = referenceBand0();
    expect(() => clipBandToRange(band0.footprint, 3.0, 3.0)).toThrow();
  });
});

describe('placeBandSolids', () => {
  it('places decomposeWall solids onto a mitered band', () => {
    const band0 = referenceBand0();
    const placed = placeBandSolids(band0, decomposeWall(referenceWall));

    expect(placed.map((solid) => solid.name)).toEqual([
      'W-01/p1',
      'W-01/s1',
      'W-01/l1',
      'W-01/p2',
      'W-01/l2',
      'W-01/p3',
    ]);

    const expected: {
      name: string;
      footprint: [number, number][];
      zMin: number;
      zMax: number;
    }[] = [
      {
        name: 'W-01/p1',
        footprint: [
          [-0.15, -0.15],
          [1.4, -0.15],
          [1.4, 0.15],
          [0.15, 0.15],
        ],
        zMin: 0,
        zMax: 3,
      },
      {
        name: 'W-01/s1',
        footprint: [
          [1.4, -0.15],
          [2.6, -0.15],
          [2.6, 0.15],
          [1.4, 0.15],
        ],
        zMin: 0,
        zMax: 0.9,
      },
      {
        name: 'W-01/l1',
        footprint: [
          [1.4, -0.15],
          [2.6, -0.15],
          [2.6, 0.15],
          [1.4, 0.15],
        ],
        zMin: 2.1,
        zMax: 3,
      },
      {
        name: 'W-01/p2',
        footprint: [
          [2.6, -0.15],
          [3.8, -0.15],
          [3.8, 0.15],
          [2.6, 0.15],
        ],
        zMin: 0,
        zMax: 3,
      },
      {
        name: 'W-01/l2',
        footprint: [
          [3.8, -0.15],
          [4.7, -0.15],
          [4.7, 0.15],
          [3.8, 0.15],
        ],
        zMin: 2.1,
        zMax: 3,
      },
      {
        name: 'W-01/p3',
        footprint: [
          [4.7, -0.15],
          [6.15, -0.15],
          [5.85, 0.15],
          [4.7, 0.15],
        ],
        zMin: 0,
        zMax: 3,
      },
    ];

    expected.forEach((entry, index) => {
      const solid = placed[index];
      expect(solid.name).toBe(entry.name);
      expect(solid.placement.rotationDeg).toBe(0);
      expectPoint(solid.placement.origin, [0, 0, 0]);
      entry.footprint.forEach((point, pointIndex) => {
        expectPoint(solid.local.footprint[pointIndex], point);
      });
      expect(Math.abs(solid.local.zMin - entry.zMin)).toBeLessThanOrEqual(
        tolerance,
      );
      expect(Math.abs(solid.local.zMax - entry.zMax)).toBeLessThanOrEqual(
        tolerance,
      );
    });
  });

  it('throws on a thickness mismatch between wall and band', () => {
    const band0 = referenceBand0();
    const mismatchedWall: WallSpec = { ...referenceWall, thickness: 0.4 };
    expect(() =>
      placeBandSolids(band0, decomposeWall(mismatchedWall)),
    ).toThrow(/W-01\/p1/);
  });

  it('throws when an opening starts inside the miter zone', () => {
    const band0 = referenceBand0();
    const cornerOverlapWall: WallSpec = {
      ...referenceWall,
      openings: [
        {
          id: 'win1',
          kind: 'window',
          xStart: 0.05,
          width: 1.0,
          sill: 0.9,
          head: 2.1,
        },
        referenceWall.openings[1],
      ],
    };
    expect(() =>
      placeBandSolids(band0, decomposeWall(cornerOverlapWall)),
    ).toThrow(/core/i);
  });
});
