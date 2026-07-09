/**
 * rhino3dm 8.17.0's bundled type declarations disagree with its compiled WASM bindings.
 * Every workaround for that divergence lives in this file and nowhere else.
 * Each entry must record the observed runtime error that justifies it.
 */

type BoundingBoxGeometry = { getBoundingBox(): { min: number[]; max: number[] } };

// .d.ts declares getBoundingBox(accurate: boolean); the WASM binding takes 0 args.
// Verified by BindingError at runtime, rhino3dm 8.17.0, 2026-07-09.
export function getBBox(geom: object): { min: number[]; max: number[] } {
  return (geom as unknown as BoundingBoxGeometry).getBoundingBox();
}
