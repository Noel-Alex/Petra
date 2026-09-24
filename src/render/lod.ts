import type { CameraView, DishRenderSnapshot, RenderLineage, SemanticZoomLevel } from "./model";
export interface GlyphSample { readonly lineageId: string; readonly cellIndex: number; readonly x: number; readonly y: number; readonly weight: number; }
export interface GlyphSamplingOptions { readonly maxGlyphs: number; readonly minimumDensity: number; }
/** Deterministic visual-proxy sampling. A glyph is not one bacterium. */
export function sampleRepresentativeGlyphs(snapshot: DishRenderSnapshot, camera: CameraView, level: SemanticZoomLevel, options: GlyphSamplingOptions): readonly GlyphSample[] {
  if (!Number.isInteger(options.maxGlyphs) || options.maxGlyphs < 0) throw new RangeError("maxGlyphs must be a non-negative integer");
  if (!Number.isFinite(options.minimumDensity) || options.minimumDensity < 0) throw new RangeError("minimumDensity must be finite and >= 0");
  if (options.maxGlyphs === 0 || level === "dish") return [];
  const candidates: Array<GlyphSample & { score: number }> = [];
  for (const lineage of snapshot.lineages) collectLineageCandidates(snapshot, lineage, camera, options.minimumDensity, candidates);
  candidates.sort((a,b) => b.score-a.score || a.lineageId.localeCompare(b.lineageId) || a.cellIndex-b.cellIndex);
  return candidates.slice(0, options.maxGlyphs).map(({score:_score,...glyph}) => glyph);
}
function collectLineageCandidates(snapshot: DishRenderSnapshot, lineage: RenderLineage, camera: CameraView, minimumDensity: number, output: Array<GlyphSample & {score:number}>): void {
  const widthDenominator=Math.max(1,snapshot.gridWidth-1), heightDenominator=Math.max(1,snapshot.gridHeight-1), visibleRadius=Math.min(0.75,0.72/Math.max(1,camera.zoom)), radiusSquared=visibleRadius*visibleRadius;
  for(let cellIndex=0;cellIndex<lineage.density.length;cellIndex+=1){ const weight=lineage.density[cellIndex]??0; if(weight<minimumDensity||snapshot.dishMask[cellIndex]!==1) continue; const column=cellIndex%snapshot.gridWidth,row=Math.floor(cellIndex/snapshot.gridWidth),x=column/widthDenominator,y=row/heightDenominator,dx=x-camera.centerX,dy=y-camera.centerY; if(dx*dx+dy*dy>radiusSquared) continue; output.push({lineageId:lineage.id,cellIndex,x,y,weight,score:stableScore(snapshot.snapshotId,lineage.id,cellIndex,weight)}); }
}
function stableScore(snapshotId:string,lineageId:string,cellIndex:number,weight:number):number { let hash=2166136261; const key=`${snapshotId}|${lineageId}|${cellIndex}`; for(let i=0;i<key.length;i+=1){hash^=key.charCodeAt(i);hash=Math.imul(hash,16777619);} return Math.log1p(weight)+(hash>>>0)/0xffffffff*0.15; }
