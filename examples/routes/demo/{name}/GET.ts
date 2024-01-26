import { HandlerParams, SSEResponse } from "VSHS";

export default async function({route}: HandlerParams) {

	let SSE = new SSEResponse( () => {
		process.kill()
	});

	// not optimized
	const process = new Deno.Command("tail", {
		args: ["-f", "-n", "-1", "./demo/messages.txt"],
		stdout: "piped"
	}).spawn();

	for await (let chunk of process.stdout.pipeThrough( new TextDecoderStream() ) ) {
		
		let data = JSON.parse(chunk);

		if(data.name !== route.vars.name)
			return;

		SSE.send(data, "message");
	}

	return SSE;
}