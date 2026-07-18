import { describe, expect, it } from 'vitest';

import type { BuildingSpec } from '../spec/building-spec';
import { compile } from './compile';

function validSingleLevel(): BuildingSpec {
  return {
    site: {
      origin: { lat: 40.7128, lon: -74.006 },
      northRotationDeg: 0,
    },
    levels: [{ id: 'L1', name: 'Ground Floor', elevation: 0 }],
    grid: [],
    massing: [
      {
        levelId: 'L1',
        outline: [
          [0, 0],
          [10, 0],
          [10, 8],
          [0, 8],
        ],
        floorToFloor: 3.5,
      },
    ],
    envelope: {
      walls: [
        {
          id: 'W1',
          levelId: 'L1',
          start: [0, 0],
          end: [10, 0],
          thickness: 0.2,
          height: 3.5,
        },
        {
          id: 'W2',
          levelId: 'L1',
          start: [10, 0],
          end: [10, 8],
          thickness: 0.2,
          height: 3.5,
        },
        {
          id: 'W3',
          levelId: 'L1',
          start: [10, 8],
          end: [0, 8],
          thickness: 0.2,
          height: 3.5,
        },
        {
          id: 'W4',
          levelId: 'L1',
          start: [0, 8],
          end: [0, 0],
          thickness: 0.2,
          height: 3.5,
        },
      ],
      slabs: [
        {
          id: 'S1',
          levelId: 'L1',
          outline: [
            [0, 0],
            [10, 0],
            [10, 8],
            [0, 8],
          ],
          thickness: 0.3,
        },
      ],
      roof: {
        type: 'flat',
        levelId: 'L1',
        thickness: 0.25,
      },
    },
    openings: [
      {
        id: 'O1',
        hostWallId: 'W1',
        kind: 'window',
        width: 1.2,
        sill: 0.9,
        head: 2.1,
        position: 2,
      },
    ],
    interior: {
      partitions: [],
      rooms: [],
    },
    designRationale: {
      keptFeatures: [],
      droppedFeatures: [],
      declaredOverrides: [],
    },
  };
}

describe('compile', () => {
  it('returns validation failure for invalid input', () => {
    const result = compile({ levels: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe('validation');
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it('rejects multi-level specs as unsupported', () => {
    const spec = validSingleLevel();
    spec.levels.push({ id: 'L2', name: 'Level 2', elevation: 3.5 });
    spec.massing.push({
      levelId: 'L2',
      outline: [
        [0, 0],
        [10, 0],
        [10, 8],
        [0, 8],
      ],
      floorToFloor: 3.5,
    });
    spec.envelope.walls.push(
      {
        id: 'W5',
        levelId: 'L2',
        start: [0, 0],
        end: [10, 0],
        thickness: 0.2,
        height: 3.5,
      },
      {
        id: 'W6',
        levelId: 'L2',
        start: [10, 0],
        end: [10, 8],
        thickness: 0.2,
        height: 3.5,
      },
      {
        id: 'W7',
        levelId: 'L2',
        start: [10, 8],
        end: [0, 8],
        thickness: 0.2,
        height: 3.5,
      },
      {
        id: 'W8',
        levelId: 'L2',
        start: [0, 8],
        end: [0, 0],
        thickness: 0.2,
        height: 3.5,
      },
    );
    spec.envelope.slabs.push({
      id: 'S2',
      levelId: 'L2',
      outline: [
        [0, 0],
        [10, 0],
        [10, 8],
        [0, 8],
      ],
      thickness: 0.3,
    });

    const result = compile(spec);
    expect(result).toEqual({
      ok: false,
      stage: 'unsupported',
      reason: 'multi-level not yet supported (2d-ii)',
    });
  });

  it('rejects pitched roofs as unsupported', () => {
    const spec = validSingleLevel();
    spec.envelope.roof = {
      type: 'pitched',
      levelId: 'L1',
      thickness: 0.25,
    };

    const result = compile(spec);
    expect(result).toEqual({
      ok: false,
      stage: 'unsupported',
      reason: 'pitched roof not supported in Stage 1',
    });
  });

  it('stops at missing N-gon PlacedSolid constructor for slab/roof', () => {
    const result = compile(validSingleLevel());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe('unsupported');
    expect(result.reason).toMatch(/N-gon PlacedSolid constructor missing/);
  });

  it('converts geometry-engine throws into structured geometry failures', () => {
    const spec = validSingleLevel();
    // Opening width that overflows the wall centerline → decomposeWall throws.
    spec.openings = [
      {
        id: 'O-bad',
        hostWallId: 'W1',
        kind: 'door',
        width: 100,
        sill: 0,
        head: 2.1,
        position: 0,
      },
    ];

    const result = compile(spec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe('geometry');
    expect(result.reason.length).toBeGreaterThan(0);
  });
});
