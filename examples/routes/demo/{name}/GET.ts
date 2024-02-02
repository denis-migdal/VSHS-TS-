import { HandlerParams, SSEResponse, rootDir } from "VSHS";

export default async function({route}: HandlerParams) {

	// not optimized
	const process = new Deno.Command("tail", {
			args: ["-F", "-n", "-1", `${rootDir()}/demo/messages.txt`],
			stdout: "piped",
			stderr: "piped",
		}).spawn();

	return new SSEResponse( async (self) => {

		self.onConnectionClosed = () => process.kill();
		
		for await (let chunk of process.stdout.pipeThrough( new TextDecoderStream() ) ) {
			
			let data = JSON.parse(chunk);

			if(data.name !== route.vars.name)
				continue;

			await self.send(data, "message");
		}
	});
}
