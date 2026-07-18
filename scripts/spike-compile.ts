import type { BuildingSpec } from '../src/lib/spec/building-spec';
import { compile } from '../src/lib/compiler/compile';

function fixture(): BuildingSpec {
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

function main() {
  console.log('=== COMPILE SPIKE — SINGLE-LEVEL (PARTIAL: WALLS ONLY UNTIL N-GON) ===');

  const invalid = compile({ not: 'a building' });
  console.log('invalid input:', invalid);

  const multi = fixture();
  multi.levels.push({ id: 'L2', name: 'L2', elevation: 3.5 });
  multi.massing.push({
    levelId: 'L2',
    outline: [
      [0, 0],
      [10, 0],
      [10, 8],
      [0, 8],
    ],
    floorToFloor: 3.5,
  });
  multi.envelope.walls.push(
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
  multi.envelope.slabs.push({
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
  console.log('multi-level:', compile(multi));

  const pitched = fixture();
  pitched.envelope.roof = {
    type: 'pitched',
    levelId: 'L1',
    thickness: 0.25,
  };
  console.log('pitched roof:', compile(pitched));

  const result = compile(fixture());
  console.log('single-level flat:', result);

  if (!result.ok && result.stage === 'unsupported' && /N-gon/.test(result.reason)) {
    console.log(
      'COMPILE SPIKE: STOPPED — missing N-gon PlacedSolid constructor (placePrism is 4-point only)',
    );
    console.log(
      'Also: BuildingSpec slabs use `thickness`, not `depth` as in the task brief.',
    );
    process.exit(0);
  }

  console.log('COMPILE SPIKE: unexpected result shape');
  process.exit(1);
}

main();
