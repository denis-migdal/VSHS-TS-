import { SSEResponse } from "VSHS";

export default async function() {

	return new SSEResponse( async (self) => {

		self.onConnectionClosed = () => {
			clearInterval(timer);
		}

		let i = 0;
		let timer = setInterval( async () => {
			await self.send({count: i++}, "event_name")
		}, 1000);

	});
}