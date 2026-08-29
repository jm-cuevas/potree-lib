/**
 * @author roy.mdr
 *
 * Exports a {@link Points}-shaped profile-query result to a minimal AutoCAD DXF
 * (R10 / AC1006) containing one `POINT` entity per sample. With `flatten` the
 * points are laid out along their mileage (distance along the profile segment)
 * on the X axis and elevation on Z, producing a 2D section drawing; otherwise
 * the original XYZ coordinates are kept. Pure string transform - no DOM.
 */
export class DXFProfileExporter {

	/**
	 * Reshapes the parallel-array `points.data` into separate x/y/z arrays plus
	 * an axis-aligned bounding range.
	 *
	 * @param {{data: {mileage: ArrayLike<number>, position: ArrayLike<number>, rgba?: ArrayLike<number>}, numPoints: number}} points
	 * @param {boolean} [flatten=false] project onto (mileage, 0, z) instead of (x, y, z)
	 */
	static toXYZ (points, flatten = false) {

		const pointsXYZ = {
			x: [],
			y: [],
			z: [],
			minX: Number.MAX_VALUE,
			minY: Number.MAX_VALUE,
			minZ: Number.MAX_VALUE,
			maxX: -Number.MAX_VALUE,
			maxY: -Number.MAX_VALUE,
			maxZ: -Number.MAX_VALUE,
			numPoints: 0,
		};

		const pData = points.data;
		const pMileage = pData.mileage;
		const pCoords = pData.position;

		for (let pIx = 0; pIx < points.numPoints; pIx++) {

			const poMileage = pMileage[pIx];
			const poCoordX = pCoords[((pIx * 3) + 0)];
			const poCoordY = pCoords[((pIx * 3) + 1)];
			const poCoordZ = pCoords[((pIx * 3) + 2)];

			if (flatten === true) {

				pointsXYZ.x.push(poMileage);
				pointsXYZ.y.push(0);
				pointsXYZ.z.push(poCoordZ);

				// Get boundaries X
				if (pointsXYZ.maxX < poMileage) pointsXYZ.maxX = poMileage;
				if (pointsXYZ.minX > poMileage) pointsXYZ.minX = poMileage;

				// Get boundaries Z
				if (pointsXYZ.maxZ < poCoordZ) pointsXYZ.maxZ = poCoordZ;
				if (pointsXYZ.minZ > poCoordZ) pointsXYZ.minZ = poCoordZ;

			} else {

				pointsXYZ.x.push(poCoordX);
				pointsXYZ.y.push(poCoordY);
				pointsXYZ.z.push(poCoordZ);

				// Get boundaries X
				if (pointsXYZ.maxX < poCoordX) pointsXYZ.maxX = poCoordX;
				if (pointsXYZ.minX > poCoordX) pointsXYZ.minX = poCoordX;

				// Get boundaries Y
				if (pointsXYZ.maxY < poCoordY) pointsXYZ.maxY = poCoordY;
				if (pointsXYZ.minY > poCoordY) pointsXYZ.minY = poCoordY;

				// Get boundaries Z
				if (pointsXYZ.maxZ < poCoordZ) pointsXYZ.maxZ = poCoordZ;
				if (pointsXYZ.minZ > poCoordZ) pointsXYZ.minZ = poCoordZ;

			}

		}

		if (flatten === true) {
			// Set boundaries Y
			pointsXYZ.maxY = 0;
			pointsXYZ.minY = 0;
		}

		pointsXYZ.numPoints = points.numPoints;

		return pointsXYZ;
	}

	static plotPCloudPoint (x, y, z) {

		const dxfSection = `0
POINT
8
layer_pointCloud
10
${x}
20
${y}
30
${z}
`;

		return dxfSection;
	}

	/**
	 * @param {{data: {mileage: ArrayLike<number>, position: ArrayLike<number>}, numPoints: number}} points
	 * @param {boolean} [flatten=false]
	 * @returns {string} DXF text
	 */
	static toString (points, flatten = false) {

		const pCloud = DXFProfileExporter.toXYZ(points, flatten);

		const dxfHeader = `999
DXF created from potree
0
SECTION
2
HEADER
9
$ACADVER
1
AC1006
9
$INSBASE
10
0.0
20
0.0
30
0.0
9
$EXTMIN
10
${pCloud.minX}
20
${pCloud.minY}
30
${pCloud.minZ}
9
$EXTMAX
10
${pCloud.maxX}
20
${pCloud.maxY}
30
${pCloud.maxZ}
0
ENDSEC
`;

		let dxfBody = `0
SECTION
2
ENTITIES
`;

		for (let i = 0; i < pCloud.numPoints; i++) {
			dxfBody += DXFProfileExporter.plotPCloudPoint(pCloud.x[i], pCloud.y[i], pCloud.z[i]);
		}

		dxfBody += `0
ENDSEC
`;

		const dxf = dxfHeader + dxfBody + '0\nEOF';

		return dxf;
	}

}
