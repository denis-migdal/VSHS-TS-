import { HandlerParams } from "VSHS";


export default async function({body}: HandlerParams) {

	if( body instanceof Blob )
		return body.type;

	if( body === null)
		return 'null'

	return body.constructor.name;
}