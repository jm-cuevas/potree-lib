/**
 * Reads a query parameter from `window.location.search`.
 *
 * @param {string} name
 * @returns {string | null}
 */
export function getParameterByName(name){
	name = name.replace(/[[]/, '\\[').replace(/[\]]/, '\\]');
	let regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
	let results = regex.exec(document.location.search);

	return results === null ? null : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

/**
 * Writes/replaces a query parameter in the current URL (via `history.replaceState`).
 *
 * @param {string} name
 * @param {string} value
 */
export function setParameter(name, value){
	name = name.replace(/[[]/, '\\[').replace(/[\]]/, '\\]');
	let regex = new RegExp('([\\?&])(' + name + '=([^&#]*))');
	let results = regex.exec(document.location.search);

	let url = window.location.href;
	if(results === null){
		url = url + (window.location.search.length === 0 ? '?' : '&') + name + '=' + value;
	}else{
		let newValue = name + '=' + value;
		url = url.replace(results[2], newValue);
	}
	window.history.replaceState({}, '', url);
}
