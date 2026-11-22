export type SectorType =
  | 'classroom'
  | 'office'
  | 'lounge'
  | 'facility'
  | 'auditorium'
  | 'restroom_men'
  | 'restroom_women'
  | 'stairs'
  | 'elevator'
  | 'entrance'
  | 'void';

export interface Sector {
  id: string;
  floor: string;
  type: SectorType;
  roomNumber: string | null;
  name: string;
  shortLabel: string;
  center: [number, number];
  doorPos: [number, number];
  corridorNodeId: string | null;
  polygon: [number, number][];
}

export interface CorridorNode {
  id: string;
  x: number;
  y: number;
}

export interface CorridorEdge {
  from: string;
  to: string;
  weight: number;
}

export interface FloorData {
  floor: string;
  label: string;
  summary: string;
  viewBox: [number, number, number, number];
  shellBoundary: [number, number][][];
  corridorPolygons: [number, number][][];
  corridorGraph: {
    nodes: Record<string, CorridorNode>;
    edges: CorridorEdge[];
  };
  sectors: Sector[];
}

export interface VerticalShaft {
  id: string;
  type: 'stairs' | 'elevator';
  floors: Record<string, string>;
}

export interface BuildingData {
  buildingId: string;
  campusNo: string;
  name: string;
  englishName: string;
  floorOrder: string[];
  floors: Record<string, FloorData>;
  verticalShafts: VerticalShaft[];
  references: string[];
}

export interface RouteOptions {
  mode?: 'any' | 'stairs' | 'elevator';
}

export interface RouteResult {
  ok: boolean;
  error?: string;
  buildingId?: string;
  start?: Sector;
  end?: Sector;
  floors?: string[];
  totalDistance?: number;
  transferType?: 'stairs' | 'elevator' | null;
  transfers?: Array<{
    type: 'stairs' | 'elevator';
    fromFloor: string;
    toFloor: string;
    fromSector?: Sector;
    toSector?: Sector;
    fromPos: [number, number];
    toPos: [number, number];
  }>;
  polylinesByFloor?: Record<string, [number, number][]>;
  nodeChain?: string[];
  steps?: Array<{ type: string; transferType?: string; fromFloor: string; toFloor: string; label: string }>;
}

export interface RenderOptions {
  startSectorId?: string;
  endSectorId?: string;
  highlightedSectorIds?: string[];
  showRoomLabels?: boolean;
  showCorridorGraph?: boolean;
  showPins?: boolean;
  route?: RouteResult | null;
  onSectorClick?: (sector: Sector, floor: FloorData, ev: MouseEvent) => void;
}

export interface CatalogSummary {
  university: string;
  generatedNote: string;
  buildings: Array<{
    id: string;
    dir: string;
    campusNo: string;
    name: string;
    englishName: string;
    dataPath: string;
    floorOrder: string[];
    floors: Array<{ floor: string; label: string; summary: string; svg: string; sectorCount: number; corridorNodeCount: number }>;
    sectorCount: number;
    references: string[];
  }>;
}

export declare const SuwonBuildingMap: {
  PALETTE: Record<string, string>;
  loadCatalog(baseUrl?: string): Promise<CatalogSummary>;
  loadBuilding(buildingIdOrDir: string, baseUrl?: string): Promise<BuildingData>;
  getFloorIds(buildingData: BuildingData): string[];
  getFloor(buildingData: BuildingData, floorId: string): FloorData | null;
  listSectors(buildingData: BuildingData, floorId?: string | null, filter?: { excludeVoids?: boolean; types?: SectorType[] }): Sector[];
  findSector(buildingData: BuildingData, queryOrId: string): Sector | null;
  findCorridorRoute(buildingData: BuildingData, startIdOrQuery: string | Sector, endIdOrQuery: string | Sector, options?: RouteOptions): RouteResult;
  colorSector(svgOrContainer: HTMLElement | SVGSVGElement, sectorId: string, options?: { fill?: string; stroke?: string; strokeWidth?: number; label?: string; showLabel?: boolean }): boolean;
  clearHighlights(svgOrContainer: HTMLElement | SVGSVGElement): void;
  drawRoute(svgOrContainer: HTMLElement | SVGSVGElement, floorId: string, route: RouteResult, options?: { showPins?: boolean }): SVGGElement | null;
  render(containerOrNull: HTMLElement | null, buildingData: BuildingData, floorId: string, options?: RenderOptions): SVGSVGElement;
};

export default SuwonBuildingMap;
