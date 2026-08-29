/**
 * Describes one attribute within an {@link InterleavedBuffer}.
 */
export class InterleavedBufferAttribute {

	/**
	 * @param {string} name
	 * @param {number} bytes - size of this attribute in bytes
	 * @param {number} numElements - components per vertex (e.g. 3 for a position)
	 * @param {string} type - GL type without prefix, e.g. "FLOAT", "UNSIGNED_INT"
	 * @param {boolean} normalized
	 */
	constructor(name, bytes, numElements, type, normalized){
		this.name = name;
		this.bytes = bytes;
		this.numElements = numElements;
		this.normalized = normalized;
		this.type = type;
	}
}

/**
 * A single ArrayBuffer holding several attributes interleaved per vertex, with
 * the per-vertex stride padded up to a multiple of 4 bytes.
 */
export class InterleavedBuffer {

	/**
	 * @param {ArrayBufferView | ArrayBuffer} data
	 * @param {InterleavedBufferAttribute[]} attributes
	 * @param {number} numElements - number of vertices
	 */
	constructor(data, attributes, numElements){
		this.data = data;
		this.attributes = attributes;
		this.stride = attributes.reduce((a, att) => a + att.bytes, 0);
		this.stride = Math.ceil(this.stride / 4) * 4;
		this.numElements = numElements;
	}

	/**
	 * Byte offset of attribute `name` within one vertex, or `null` if absent.
	 *
	 * @param {string} name
	 * @returns {number | null}
	 */
	offset(name){
		let offset = 0;

		for(let att of this.attributes){
			if(att.name === name){
				return offset;
			}

			offset += att.bytes;
		}

		return null;
	}
}
