import { SSEResponse } from "VSHS";

export default async function() {

	let SSE = new SSEResponse( () => {
		clearInterval(timer);
	});

	let i = 0;
	let timer = setInterval( () => {
		SSE.send({count: i++}, "event_name")
	}, 1000);

	return SSE;
}