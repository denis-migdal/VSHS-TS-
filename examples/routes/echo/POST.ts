import { HandlerParams } from "VSHS";


export default async function({body}: HandlerParams) {

	console.log(body);

	return body;
}