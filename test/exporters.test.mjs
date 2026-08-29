// Headless unit tests for `potree-lib/exporters`.
//
// The exporters are pure data transforms (no DOM, no WebGL), so they run
// straight in Node with hand-built mock inputs:
//   * a `Points`-shaped object  -> CSVExporter / LASExporter / DXFProfileExporter
//   * a `Measure`-shaped object  -> DXFExporter / GeoJSONExporter
//
// Run with `npm test` (`node --test test/`).

import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import {
	CSVExporter,
	LASExporter,
	DXFExporter,
	DXFProfileExporter,
	GeoJSONExporter,
} from "../src/exporters/index.js";

// --- mock builders --------------------------------------------------------

/** A minimal stand-in for `utils/Points.js` output. */
function mockPoints() {
	const position = new Float32Array([
		0, 0, 0,
		1, 2, 3,
		4, 5, 6,
	]);
	const rgba = new Uint8Array([
		255, 0, 0, 255,
		0, 255, 0, 255,
		0, 0, 255, 255,
	]);
	const intensity = new Uint16Array([10, 20, 30]);
	const classification = new Uint8Array([2, 2, 6]);
	const mileage = new Float64Array([0, 3.741657, 8.774964]);

	const boundingBox = new THREE.Box3(
		new THREE.Vector3(0, 0, 0),
		new THREE.Vector3(4, 5, 6),
	);

	return {
		numPoints: 3,
		boundingBox,
		data: { position, rgba, intensity, classification, mileage },
	};
}

/** A minimal stand-in for a `tools/measure/Measure.js` instance. */
function mockMeasure(overrides = {}) {
	return {
		isMeasure: true,
		name: "Measure_test",
		closed: false,
		showDistances: false,
		showArea: false,
		edgeLabels: [],
		areaLabel: { position: new THREE.Vector3(), text: "" },
		points: [
			{ position: new THREE.Vector3(0, 0, 0) },
			{ position: new THREE.Vector3(10, 0, 0) },
			{ position: new THREE.Vector3(10, 10, 0) },
		],
		...overrides,
	};
}

// --- CSVExporter --------------------------------------------------------

test("CSVExporter: header order and row count", () => {
	const csv = CSVExporter.toString(mockPoints());
	const lines = csv.trim().split("\n");

	assert.equal(lines.length, 1 + 3, "one header + one row per point");
	// `position` and `rgba` are pinned first; the rest keep insertion order.
	assert.equal(lines[0], "x, y, z, r, g, b, a, intensity, classification, mileage");
	assert.equal(lines[1], "0, 0, 0, 255, 0, 0, 255, 10, 2, 0");
	assert.equal(lines[2], "1, 2, 3, 0, 255, 0, 255, 20, 2, 3.741657");
});

// --- LASExporter -------------------------------------------------------

test("LASExporter: valid LAS 1.2 header + point records", () => {
	const buffer = LASExporter.toLAS(mockPoints());
	assert.ok(buffer instanceof ArrayBuffer);
	assert.equal(buffer.byteLength, 227 + 28 * 3, "header + 28 bytes per point");

	const view = new DataView(buffer);
	const u8 = new Uint8Array(buffer);

	assert.equal(String.fromCharCode(u8[0], u8[1], u8[2], u8[3]), "LASF");
	assert.equal(u8[24], 1, "version major");
	assert.equal(u8[25], 2, "version minor");
	assert.equal(view.getUint16(94, true), 227, "header size");
	assert.equal(view.getUint32(96, true), 227, "offset to point data");
	assert.equal(u8[104], 2, "point data record format");
	assert.equal(view.getUint16(105, true), 28, "point data record length");
	assert.equal(view.getUint32(107, true), 3, "number of point records");

	// first point sits at the bounding-box min -> quantised (0,0,0)
	assert.equal(view.getUint32(227 + 0, true), 0);
	assert.equal(view.getUint32(227 + 4, true), 0);
	assert.equal(view.getUint32(227 + 8, true), 0);
	// scale is 0.001 -> point (1,2,3) becomes (1000, 2000, 3000)
	assert.equal(view.getUint32(227 + 28 + 0, true), 1000);
	assert.equal(view.getUint32(227 + 28 + 4, true), 2000);
	assert.equal(view.getUint32(227 + 28 + 8, true), 3000);
});

// --- DXFProfileExporter ----------------------------------------------

test("DXFProfileExporter: POINT entity per sample, DXF envelope", () => {
	const dxf = DXFProfileExporter.toString(mockPoints());
	assert.ok(dxf.startsWith("999\nDXF created from potree"));
	assert.ok(dxf.endsWith("0\nEOF"));
	assert.equal((dxf.match(/\nPOINT\n/g) || []).length, 3);
	// non-flattened -> real coords, EXTMAX carries the max x
	assert.ok(dxf.includes("$EXTMAX"));
});

test("DXFProfileExporter: flatten uses mileage on X and 0 on Y", () => {
	const flat = DXFProfileExporter.toXYZ(mockPoints(), true);
	assert.deepEqual(flat.y, [0, 0, 0]);
	assert.equal(flat.x[1], mockPoints().data.mileage[1]);
	assert.equal(flat.minY, 0);
	assert.equal(flat.maxY, 0);
});

// --- DXFExporter ----------------------------------------------------

test("DXFExporter: single point -> CIRCLE, polyline otherwise", () => {
	const one = DXFExporter.toString(mockMeasure({ points: [{ position: new THREE.Vector3(1, 2, 3) }] }));
	assert.ok(one.includes("\nCIRCLE\n"));

	const many = DXFExporter.toString(mockMeasure());
	assert.ok(many.includes("\nPOLYLINE\n"));
	assert.equal((many.match(/\nVERTEX\n/g) || []).length, 3);
	assert.ok(many.includes("\nSEQEND\n"));
	assert.ok(many.endsWith("0\nEOF"));
});

test("DXFExporter: closed measure sets the polyline closed bit", () => {
	const open = DXFExporter.toString(mockMeasure({ closed: false }));
	const closed = DXFExporter.toString(mockMeasure({ closed: true }));
	// bit code 8 (3D polyline) vs 8|1 = 9 (closed)
	assert.ok(open.includes("\n70\n8\n"));
	assert.ok(closed.includes("\n70\n9\n"));
});

test("DXFExporter: filters out non-measure entries", () => {
	const dxf = DXFExporter.toString([mockMeasure(), { notAMeasure: true }, null]);
	assert.equal((dxf.match(/\nPOLYLINE\n/g) || []).length, 1);
});

// --- GeoJSONExporter ------------------------------------------------

test("GeoJSONExporter: open measure -> LineString feature", () => {
	const gj = JSON.parse(GeoJSONExporter.toString(mockMeasure()));
	assert.equal(gj.type, "FeatureCollection");
	assert.equal(gj.features.length, 1);
	assert.equal(gj.features[0].geometry.type, "LineString");
	assert.deepEqual(gj.features[0].geometry.coordinates[1], [10, 0, 0]);
	assert.equal(gj.features[0].properties.name, "Measure_test");
});

test("GeoJSONExporter: closed measure -> Polygon with repeated first vertex", () => {
	const gj = JSON.parse(GeoJSONExporter.toString(mockMeasure({ closed: true })));
	const ring = gj.features[0].geometry.coordinates[0];
	assert.equal(gj.features[0].geometry.type, "Polygon");
	assert.deepEqual(ring[0], ring[ring.length - 1], "ring is closed");
});

test("GeoJSONExporter: single point -> Point feature", () => {
	const gj = JSON.parse(
		GeoJSONExporter.toString(mockMeasure({ points: [{ position: new THREE.Vector3(5, 6, 7) }] })),
	);
	assert.equal(gj.features[0].geometry.type, "Point");
	assert.deepEqual(gj.features[0].geometry.coordinates, [5, 6, 7]);
});

test("GeoJSONExporter: emits label features when distance/area labels are on", () => {
	const gj = JSON.parse(GeoJSONExporter.toString(mockMeasure({
		closed: true,
		showDistances: true,
		showArea: true,
		edgeLabels: [
			{ position: new THREE.Vector3(5, 0, 0), text: "10.0" },
			{ position: new THREE.Vector3(10, 5, 0), text: "10.0" },
		],
		areaLabel: { position: new THREE.Vector3(6, 3, 0), text: "100 m²" },
	})));
	const kinds = gj.features.map((f) => Object.keys(f.properties)[0]);
	assert.ok(kinds.includes("distance"));
	assert.ok(kinds.includes("area"));
});
