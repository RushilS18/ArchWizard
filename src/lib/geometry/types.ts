export type SolidType = 'wall' | 'glazing' | 'door' | 'slab' | 'roof';

export interface SolidSpec {
  type: SolidType;
  layer: string;
  name: string;
  min: [number, number, number];
  max: [number, number, number];
}

export interface OpeningSpec {
  id: string;
  kind: 'window' | 'door';
  xStart: number;
  width: number;
  sill: number;
  head: number;
}

export interface WallSpec {
  id: string;
  xStart: number;
  xEnd: number;
  y: number;
  thickness: number;
  baseZ: number;
  height: number;
  openings: OpeningSpec[];
}
