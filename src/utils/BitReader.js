/**
 * Reads unsigned integers encoded in a variable amount of bits from a buffer.
 * Bits are aligned into 32-bit unsigned integers.
 *
 * For example, given 3 integers:
 * - x: 123   encoded in 11 bits, binary: 00001111011
 * - y: 7945  encoded in 17 bits, binary: 00001111100001001
 * - z: 12    encoded in 6 bits,  binary: 001100
 *
 * ```
 * |        --- 32 bits ---         ||        --- 32 bits ---         |
 * |00001111011000011111000010010011||00..............................|
 * |     x    ||       y       ||   z  |
 * ```
 *
 * z does not fit fully into the first 32-bit integer: its first 4 bits are
 * stored at the end of the first integer and the remaining 2 bits at the start
 * of the next.
 */
export class BitReader {

	/**
	 * @param {ArrayBuffer} buf
	 */
	constructor(buf){
		this.buffer = new Uint32Array(buf);
		this.bitOffset = 0;
	}

	/**
	 * @param {number} bits - how many bits to consume (1..32)
	 * @returns {number}
	 */
	read(bits){
		let result;

		if((this.bitOffset % 32) + bits <= 32){
			let val = this.buffer[Math.floor(this.bitOffset / 32)];
			let leftGap = this.bitOffset % 32;
			let rightGap = 32 - (leftGap + bits);

			result = (val << leftGap) >>> (leftGap + rightGap);
		}else{
			let val = this.buffer[Math.floor(this.bitOffset / 32)];
			let leftGap = this.bitOffset % 32;
			let rightGap = (leftGap + bits) - 32;

			result = (val << leftGap) >>> (leftGap - rightGap);

			val = this.buffer[Math.floor(this.bitOffset / 32) + 1];
			result = result | val >>> (32 - rightGap);
		}

		this.bitOffset += bits;

		return result;
	}
}
