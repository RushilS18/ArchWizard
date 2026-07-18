import { describe, expect, it } from "vitest";
import {
  BuildingSpecSchema,
  type BuildingSpec,
} from "./building-spec";

function validFixture(): BuildingSpec {
  return {
    site: {
      origin: { lat: 40.7128, lon: -74.006 },
      northRotationDeg: 0,
    },
    levels: [{ id: "L1", name: "Ground Floor", elevation: 0 }],
    grid: [],
    massing: [
      {
        levelId: "L1",
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
          id: "W1",
          levelId: "L1",
          start: [0, 0],
          end: [10, 0],
          thickness: 0.2,
          height: 3.5,
        },
        {
          id: "W2",
          levelId: "L1",
          start: [10, 0],
          end: [10, 8],
          thickness: 0.2,
          height: 3.5,
        },
        {
          id: "W3",
          levelId: "L1",
          start: [10, 8],
          end: [0, 8],
          thickness: 0.2,
          height: 3.5,
        },
        {
          id: "W4",
          levelId: "L1",
          start: [0, 8],
          end: [0, 0],
          thickness: 0.2,
          height: 3.5,
        },
      ],
      slabs: [
        {
          id: "S1",
          levelId: "L1",
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
        type: "flat",
        levelId: "L1",
        thickness: 0.25,
      },
    },
    openings: [
      {
        id: "O1",
        hostWallId: "W1",
        kind: "window",
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

describe("BuildingSpecSchema", () => {
  it("accepts a minimal valid Stage-1 building spec", () => {
    const result = BuildingSpecSchema.safeParse(validFixture());
    expect(result.success).toBe(true);
  });

  it("rejects duplicate level ids", () => {
    const spec = validFixture();
    spec.levels.push({ id: "L1", name: "Duplicate", elevation: 3.5 });

    const result = BuildingSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
    if (result.success) return;

    const issue = result.error.issues.find(
      (entry) =>
        entry.path[0] === "levels" &&
        entry.path.includes("id") &&
        entry.message.includes("L1"),
    );
    expect(issue).toBeDefined();
  });

  it("rejects massing.levelId that does not reference an existing level", () => {
    const spec = validFixture();
    spec.massing[0].levelId = "missing-level";

    const result = BuildingSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
    if (result.success) return;

    const issue = result.error.issues.find(
      (entry) =>
        entry.path[0] === "massing" &&
        entry.path.includes("levelId") &&
        entry.message.includes("missing-level"),
    );
    expect(issue).toBeDefined();
  });

  it("rejects opening.hostWallId that does not reference an existing wall", () => {
    const spec = validFixture();
    spec.openings[0].hostWallId = "missing-wall";

    const result = BuildingSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
    if (result.success) return;

    const issue = result.error.issues.find(
      (entry) =>
        entry.path[0] === "openings" &&
        entry.path.includes("hostWallId") &&
        entry.message.includes("missing-wall"),
    );
    expect(issue).toBeDefined();
  });

  it("rejects an opening whose head is not greater than sill", () => {
    const spec = validFixture();
    spec.openings[0].sill = 2.1;
    spec.openings[0].head = 2.1;

    const result = BuildingSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
    if (result.success) return;

    const issue = result.error.issues.find(
      (entry) =>
        entry.path.includes("head") &&
        entry.message.toLowerCase().includes("sill"),
    );
    expect(issue).toBeDefined();
  });

  it("rejects a wall with negative thickness", () => {
    const spec = validFixture();
    spec.envelope.walls[0].thickness = -0.1;

    const result = BuildingSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
    if (result.success) return;

    const issue = result.error.issues.find(
      (entry) =>
        entry.path[0] === "envelope" &&
        entry.path.includes("walls") &&
        entry.path.includes("thickness"),
    );
    expect(issue).toBeDefined();
  });

  it("rejects massing that is missing a footprint for a declared level", () => {
    const spec = validFixture();
    spec.levels.push({ id: "L2", name: "Level 2", elevation: 3.5 });

    const result = BuildingSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
    if (result.success) return;

    const issue = result.error.issues.find(
      (entry) =>
        entry.path[0] === "massing" &&
        entry.message.includes("L2"),
    );
    expect(issue).toBeDefined();
  });

  it("rejects site origin latitude outside -90..90", () => {
    const spec = validFixture();
    spec.site.origin.lat = 200;

    const result = BuildingSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
    if (result.success) return;

    const issue = result.error.issues.find(
      (entry) =>
        entry.path.includes("lat") ||
        (entry.path[0] === "site" && entry.path.includes("origin")),
    );
    expect(issue).toBeDefined();
    expect(
      result.error.issues.some((entry) => entry.path.includes("lat")),
    ).toBe(true);
  });

  it("rejects a level with an empty-string id", () => {
    const spec = validFixture();
    spec.levels[0].id = "";

    const result = BuildingSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
    if (result.success) return;

    const issue = result.error.issues.find(
      (entry) =>
        entry.path[0] === "levels" && entry.path.includes("id"),
    );
    expect(issue).toBeDefined();
  });

  it("accepts walls that form the outline loop", () => {
    const result = BuildingSpecSchema.safeParse(validFixture());
    expect(result.success).toBe(true);
  });

  it("rejects a level whose wall count does not match the outline edge count", () => {
    const spec = validFixture();
    spec.envelope.walls = spec.envelope.walls.filter((wall) => wall.id !== "W4");

    const result = BuildingSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
    if (result.success) return;

    const issue = result.error.issues.find(
      (entry) =>
        entry.path[0] === "envelope" &&
        entry.path[1] === "walls" &&
        entry.message.includes("4") &&
        entry.message.includes("3"),
    );
    expect(issue).toBeDefined();
  });

  it("rejects a wall whose endpoints do not match its outline edge", () => {
    const spec = validFixture();
    spec.envelope.walls[1].end = [10, 7];

    const result = BuildingSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
    if (result.success) return;

    const issue = result.error.issues.find(
      (entry) =>
        entry.path[0] === "envelope" &&
        entry.path[1] === "walls" &&
        entry.path[2] === 1 &&
        entry.message.includes("W2") &&
        entry.message.toLowerCase().includes("expected") &&
        entry.message.toLowerCase().includes("actual"),
    );
    expect(issue).toBeDefined();
  });

  it("rejects walls given out of outline order", () => {
    const spec = validFixture();
    const wall2 = spec.envelope.walls[1];
    const wall3 = spec.envelope.walls[2];
    spec.envelope.walls[1] = wall3;
    spec.envelope.walls[2] = wall2;

    const result = BuildingSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
    if (result.success) return;

    const mismatchIssues = result.error.issues.filter(
      (entry) =>
        entry.path[0] === "envelope" &&
        entry.path[1] === "walls" &&
        typeof entry.path[2] === "number",
    );
    expect(mismatchIssues.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects a clockwise outline", () => {
    const spec = validFixture();
    spec.massing[0].outline = [
      [0, 0],
      [0, 8],
      [10, 8],
      [10, 0],
    ];
    spec.envelope.walls = [
      {
        id: "W1",
        levelId: "L1",
        start: [0, 0],
        end: [0, 8],
        thickness: 0.2,
        height: 3.5,
      },
      {
        id: "W2",
        levelId: "L1",
        start: [0, 8],
        end: [10, 8],
        thickness: 0.2,
        height: 3.5,
      },
      {
        id: "W3",
        levelId: "L1",
        start: [10, 8],
        end: [10, 0],
        thickness: 0.2,
        height: 3.5,
      },
      {
        id: "W4",
        levelId: "L1",
        start: [10, 0],
        end: [0, 0],
        thickness: 0.2,
        height: 3.5,
      },
    ];

    const result = BuildingSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
    if (result.success) return;

    const issue = result.error.issues.find(
      (entry) =>
        entry.path[0] === "massing" &&
        entry.path.includes("outline") &&
        /winding|area/i.test(entry.message),
    );
    expect(issue).toBeDefined();
  });

  it("accepts a triangle loop", () => {
    const spec = validFixture();
    spec.massing[0].outline = [
      [0, 0],
      [6, 0],
      [0, 4],
    ];
    spec.envelope.walls = [
      {
        id: "W1",
        levelId: "L1",
        start: [0, 0],
        end: [6, 0],
        thickness: 0.2,
        height: 3.5,
      },
      {
        id: "W2",
        levelId: "L1",
        start: [6, 0],
        end: [0, 4],
        thickness: 0.2,
        height: 3.5,
      },
      {
        id: "W3",
        levelId: "L1",
        start: [0, 4],
        end: [0, 0],
        thickness: 0.2,
        height: 3.5,
      },
    ];
    spec.envelope.slabs[0].outline = [
      [0, 0],
      [6, 0],
      [0, 4],
    ];

    const result = BuildingSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });
});
