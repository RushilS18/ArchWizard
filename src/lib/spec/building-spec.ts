import { z } from "zod";

const Point2DSchema = z.tuple([z.number(), z.number()]);

export const SiteSchema = z.object({
  origin: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
  }),
  northRotationDeg: z.number().min(0).max(360),
  topoRef: z.string().optional(),
});

export const LevelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  elevation: z.number(),
});

export const LevelsSchema = z.array(LevelSchema).min(1);

export const GridAxisSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  position: z.number(),
  direction: z.enum(["x", "y"]),
});

export const GridSchema = z.array(GridAxisSchema);

export const MassingSchema = z.array(
  z.object({
    levelId: z.string(),
    outline: z.array(Point2DSchema).min(3),
    floorToFloor: z.number().positive(),
  }),
);

export const EnvelopeSchema = z.object({
  walls: z.array(
    z.object({
      id: z.string(),
      levelId: z.string(),
      start: Point2DSchema,
      end: Point2DSchema,
      thickness: z.number().positive(),
      height: z.number().positive(),
    }),
  ),
  slabs: z.array(
    z.object({
      id: z.string(),
      levelId: z.string(),
      outline: z.array(Point2DSchema).min(3),
      thickness: z.number().positive(),
    }),
  ),
  roof: z.object({
    type: z.enum(["flat", "pitched"]),
    levelId: z.string(),
    thickness: z.number().positive(),
  }),
});

export const OpeningSchema = z
  .object({
    id: z.string(),
    hostWallId: z.string(),
    kind: z.enum(["window", "door"]),
    width: z.number().positive(),
    sill: z.number().min(0),
    head: z.number().positive(),
    position: z.number().min(0),
  })
  .refine((opening) => opening.head > opening.sill, {
    error: "Opening head must be greater than sill",
    path: ["head"],
  });

export const OpeningsSchema = z.array(OpeningSchema);

export const InteriorSchema = z.object({
  partitions: z.array(z.object({ id: z.string() })).default([]),
  rooms: z.array(z.object({ id: z.string() })).default([]),
});

export const DesignRationaleSchema = z.object({
  keptFeatures: z.array(
    z.object({
      feature: z.string(),
      source: z.enum(["site", "sketch", "description", "assumption"]),
    }),
  ),
  droppedFeatures: z.array(
    z.object({
      feature: z.string(),
      reason: z.string(),
    }),
  ),
  declaredOverrides: z.array(
    z.object({
      element: z.string(),
      change: z.string(),
      justification: z.string(),
    }),
  ),
});

export const BuildingSpecSchema = z
  .object({
    site: SiteSchema,
    levels: LevelsSchema,
    grid: GridSchema,
    massing: MassingSchema,
    envelope: EnvelopeSchema,
    openings: OpeningsSchema,
    interior: InteriorSchema,
    designRationale: DesignRationaleSchema,
  })
  .superRefine((data, ctx) => {
    const levelIds = new Set<string>();
    for (let i = 0; i < data.levels.length; i++) {
      const id = data.levels[i].id;
      if (levelIds.has(id)) {
        ctx.addIssue({
          code: "custom",
          path: ["levels", i, "id"],
          message: `Duplicate level id: ${id}`,
        });
      }
      levelIds.add(id);
    }

    const axisIds = new Set<string>();
    for (let i = 0; i < data.grid.length; i++) {
      const id = data.grid[i].id;
      if (axisIds.has(id)) {
        ctx.addIssue({
          code: "custom",
          path: ["grid", i, "id"],
          message: `Duplicate grid axis id: ${id}`,
        });
      }
      axisIds.add(id);
    }

    const wallIds = new Set<string>();
    for (let i = 0; i < data.envelope.walls.length; i++) {
      const id = data.envelope.walls[i].id;
      if (wallIds.has(id)) {
        ctx.addIssue({
          code: "custom",
          path: ["envelope", "walls", i, "id"],
          message: `Duplicate wall id: ${id}`,
        });
      }
      wallIds.add(id);
    }

    for (let i = 0; i < data.massing.length; i++) {
      const levelId = data.massing[i].levelId;
      if (!levelIds.has(levelId)) {
        ctx.addIssue({
          code: "custom",
          path: ["massing", i, "levelId"],
          message: `Massing footprint references unknown level id: ${levelId}`,
        });
      }
    }

    for (let i = 0; i < data.envelope.walls.length; i++) {
      const levelId = data.envelope.walls[i].levelId;
      if (!levelIds.has(levelId)) {
        ctx.addIssue({
          code: "custom",
          path: ["envelope", "walls", i, "levelId"],
          message: `Wall references unknown level id: ${levelId}`,
        });
      }
    }

    for (let i = 0; i < data.envelope.slabs.length; i++) {
      const levelId = data.envelope.slabs[i].levelId;
      if (!levelIds.has(levelId)) {
        ctx.addIssue({
          code: "custom",
          path: ["envelope", "slabs", i, "levelId"],
          message: `Slab references unknown level id: ${levelId}`,
        });
      }
    }

    if (!levelIds.has(data.envelope.roof.levelId)) {
      ctx.addIssue({
        code: "custom",
        path: ["envelope", "roof", "levelId"],
        message: `Roof references unknown level id: ${data.envelope.roof.levelId}`,
      });
    }

    for (let i = 0; i < data.openings.length; i++) {
      const hostWallId = data.openings[i].hostWallId;
      if (!wallIds.has(hostWallId)) {
        ctx.addIssue({
          code: "custom",
          path: ["openings", i, "hostWallId"],
          message: `Opening references unknown wall id: ${hostWallId}`,
        });
      }
    }

    const massingCounts = new Map<string, number>();
    for (let i = 0; i < data.massing.length; i++) {
      const levelId = data.massing[i].levelId;
      const next = (massingCounts.get(levelId) ?? 0) + 1;
      massingCounts.set(levelId, next);
      if (next > 1) {
        ctx.addIssue({
          code: "custom",
          path: ["massing", i, "levelId"],
          message: `Duplicate massing footprint for level id: ${levelId}`,
        });
      }
    }

    for (const levelId of levelIds) {
      if (!massingCounts.has(levelId)) {
        ctx.addIssue({
          code: "custom",
          path: ["massing"],
          message: `Missing massing footprint for level id: ${levelId}`,
        });
      }
    }
  });

export type Site = z.infer<typeof SiteSchema>;
export type Level = z.infer<typeof LevelSchema>;
export type Levels = z.infer<typeof LevelsSchema>;
export type GridAxis = z.infer<typeof GridAxisSchema>;
export type Grid = z.infer<typeof GridSchema>;
export type Massing = z.infer<typeof MassingSchema>;
export type Envelope = z.infer<typeof EnvelopeSchema>;
export type Opening = z.infer<typeof OpeningSchema>;
export type Openings = z.infer<typeof OpeningsSchema>;
export type Interior = z.infer<typeof InteriorSchema>;
export type DesignRationale = z.infer<typeof DesignRationaleSchema>;
export type BuildingSpec = z.infer<typeof BuildingSpecSchema>;
