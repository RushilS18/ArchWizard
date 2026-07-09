import type { SolidSpec, WallSpec } from './types';

export function decomposeWall(wall: WallSpec): SolidSpec[] {
  const openings = [...wall.openings].sort((a, b) => a.xStart - b.xStart);

  for (const opening of openings) {
    const openingStart = opening.xStart;
    const openingEnd = opening.xStart + opening.width;

    if (openingStart < wall.xStart || openingEnd > wall.xEnd) {
      throw new Error(
        `Opening ${opening.id} is outside wall bounds [${wall.xStart}, ${wall.xEnd}]`,
      );
    }
    if (opening.sill < 0) {
      throw new Error(`Opening ${opening.id} has negative sill ${opening.sill}`);
    }
    if (opening.head > wall.height) {
      throw new Error(
        `Opening ${opening.id} head ${opening.head} exceeds wall height ${wall.height}`,
      );
    }
    if (opening.head <= opening.sill) {
      throw new Error(
        `Opening ${opening.id} has non-positive height: sill ${opening.sill}, head ${opening.head}`,
      );
    }
  }

  for (let i = 1; i < openings.length; i += 1) {
    const prev = openings[i - 1];
    const next = openings[i];
    const prevEnd = prev.xStart + prev.width;
    if (prevEnd > next.xStart) {
      throw new Error(`Openings ${prev.id} and ${next.id} overlap`);
    }
  }

  const yMin = wall.y - wall.thickness / 2;
  const yMax = wall.y + wall.thickness / 2;
  const solids: SolidSpec[] = [];

  let currentX = wall.xStart;
  let pierIndex = 1;

  openings.forEach((opening, index) => {
    const x1 = opening.xStart;
    const x2 = opening.xStart + opening.width;
    const openingIndex = index + 1;

    if (x1 > currentX) {
      solids.push({
        type: 'wall',
        layer: 'A-WALL',
        name: `${wall.id}/p${pierIndex}`,
        min: [currentX, yMin, wall.baseZ],
        max: [x1, yMax, wall.baseZ + wall.height],
      });
      pierIndex += 1;
    }

    if (opening.sill > 0) {
      solids.push({
        type: 'wall',
        layer: 'A-WALL',
        name: `${wall.id}/s${openingIndex}`,
        min: [x1, yMin, wall.baseZ],
        max: [x2, yMax, wall.baseZ + opening.sill],
      });
    }

    if (opening.head < wall.height) {
      solids.push({
        type: 'wall',
        layer: 'A-WALL',
        name: `${wall.id}/l${openingIndex}`,
        min: [x1, yMin, wall.baseZ + opening.head],
        max: [x2, yMax, wall.baseZ + wall.height],
      });
    }

    currentX = x2;
  });

  if (currentX < wall.xEnd) {
    solids.push({
      type: 'wall',
      layer: 'A-WALL',
      name: `${wall.id}/p${pierIndex}`,
      min: [currentX, yMin, wall.baseZ],
      max: [wall.xEnd, yMax, wall.baseZ + wall.height],
    });
  }

  return solids;
}
