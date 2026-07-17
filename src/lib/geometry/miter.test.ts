import { describe, expect, it } from 'vitest';

import { computeWallBands } from './miter';

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
