// Phase 6 - exporters. Pure data transforms that turn the results of a
// measurement or a profile query into an interchange format. None of them
// touch the DOM; writing the returned string / ArrayBuffer to a file (Blob +
// download link, `fs.writeFile`, ...) is left to the consuming app.
//
//   CSVExporter          - Points -> CSV text
//   LASExporter          - Points -> uncompressed LAS 1.2 ArrayBuffer
//   DXFProfileExporter   - Points -> AutoCAD DXF (POINT entities, optional 2D flatten)
//   DXFExporter          - Measure(s) -> AutoCAD DXF (CIRCLE / POLYLINE entities)
//   GeoJSONExporter      - Measure(s) -> GeoJSON FeatureCollection text
//
// "Points" is the shape produced by the profile tool
// (`potree-lib/utils` -> `Points`, or `PointCloudOctree.getPointsInProfile`):
// `{ numPoints, boundingBox, data: { position, rgba, intensity, ... } }`.

export {CSVExporter} from "./CSVExporter.js";
export {LASExporter} from "./LASExporter.js";
export {DXFExporter} from "./DXFExporter.js";
export {DXFProfileExporter} from "./DXFProfileExporter.js";
export {GeoJSONExporter} from "./GeoJSONExporter.js";
