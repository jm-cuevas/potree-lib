/**
 * @author sigeom sa / http://sigeom.ch
 * @author Ioda-Net Sàrl / https://www.ioda-net.ch/
 * @author Markus Schütz / http://potree.org
 *
 * Exports {@link Measure} objects to a GeoJSON `FeatureCollection` string.
 * A one-point measure becomes a `Point`, an open multi-point measure a
 * `LineString`, a closed one a `Polygon`. When the measure has distance / area
 * labels enabled, each label is emitted as an extra `Point` feature carrying
 * the label text in its properties. Pure data transform - no DOM.
 */

/** @typedef {import("../tools/measure/Measure.js").Measure} Measure */

/** @param {any} m @returns {m is Measure} */
const isMeasure = (m) => Boolean(m && m.isMeasure);

export class GeoJSONExporter {

	/** @param {Measure} measurement */
	static measurementToFeatures (measurement) {
		let coords = measurement.points.map(e => e.position.toArray());

		let features = [];

		if (coords.length === 1) {
			let feature = {
				type: 'Feature',
				geometry: {
					type: 'Point',
					coordinates: coords[0],
				},
				properties: {
					name: measurement.name,
				},
			};
			features.push(feature);
		} else if (coords.length > 1 && !measurement.closed) {
			let object = {
				'type': 'Feature',
				'geometry': {
					'type': 'LineString',
					'coordinates': coords,
				},
				'properties': {
					name: measurement.name,
				},
			};

			features.push(object);
		} else if (coords.length > 1 && measurement.closed) {
			let object = {
				'type': 'Feature',
				'geometry': {
					'type': 'Polygon',
					'coordinates': [[...coords, coords[0]]],
				},
				'properties': {
					name: measurement.name,
				},
			};
			features.push(object);
		}

		if (measurement.showDistances) {
			measurement.edgeLabels.forEach((label) => {
				let labelPoint = {
					type: 'Feature',
					geometry: {
						type: 'Point',
						coordinates: label.position.toArray(),
					},
					properties: {
						distance: label.text,
					},
				};
				features.push(labelPoint);
			});
		}

		if (measurement.showArea) {
			let point = measurement.areaLabel.position;
			let labelArea = {
				type: 'Feature',
				geometry: {
					type: 'Point',
					coordinates: point.toArray(),
				},
				properties: {
					area: measurement.areaLabel.text,
				},
			};
			features.push(labelArea);
		}

		return features;
	}

	/**
	 * @param {Measure | Measure[]} measurements one measurement or an array
	 * @returns {string} tab-indented GeoJSON text
	 */
	static toString (measurements) {
		if (!(measurements instanceof Array)) {
			measurements = [measurements];
		}

		measurements = measurements.filter(isMeasure);

		let features = [];
		for (let measure of measurements) {
			let f = GeoJSONExporter.measurementToFeatures(measure);

			features = features.concat(f);
		}

		let geojson = {
			'type': 'FeatureCollection',
			'features': features,
		};

		return JSON.stringify(geojson, null, '\t');
	}

}
