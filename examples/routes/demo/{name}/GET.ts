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


	bind_stdout(process, (new_content: string) => {

		let data = JSON.parse(new_content)

		if(data.name !== route.vars.name)
			return;

		SSE.send(data, "message");
	});


	return SSE;
}



async function bind_stdout( process: any, callback: (new_content: string) => void ) {

	// Because it would have been too simple if we had a simple API... JS = Baka
	const decoder = new TextDecoder();
	const body_reader = process.stdout.getReader();
	let chunk!: {done: boolean, value?: Uint8Array};
	while( ! (chunk = await body_reader.read()).done )
		callback( decoder.decode(chunk.value, {stream: true}) );
}