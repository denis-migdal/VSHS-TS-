type HTTPServerOpts = {
	port: number,
	hostname: string,
	routes: string
};


export default async function startHTTPServer({port, hostname, routes}: HTTPServerOpts) {

	const routesHandlers = await loadAllRoutesHandlers(routes);
	const requestHandler = buildRequestHandler(routesHandlers);

	// https://docs.deno.com/runtime/tutorials/http_server
	Deno.serve({ port, hostname }, requestHandler);
}

export class HTTPError extends Error {

	#error_code:number;

	constructor(http_error_code: number, message: string) {
		super(message);
		this.name = "HTTPError";
		this.#error_code = http_error_code;
	}

	get error_code() {
		return this.#error_code;
	}
}

export class SSEResponse {

	#closeCallback: () => void;
	#controller?: ReadableStreamDefaultController;

	#stream = new ReadableStream({

		start: (controller) => {
			this.#controller = controller
		},
		cancel: () => {
			this.#closeCallback();
		}
	});

	constructor(closeCallback: () => void) {
		this.#closeCallback = closeCallback;
	}

	get _body() {
		return this.#stream;
	}

	send(data: any, event?: string) {

		let text = `data: ${JSON.stringify(data)}\n\n`;
		if( event !== undefined)
			text = `event: ${event}\n${text}`

		this.#controller?.enqueue( new TextEncoder().encode( text ) );
	}
}

export type HandlerParams = {

	url : URL,
	body: null|any,
	route: {
		path: string,
		vars: Record<string, string>
	}
};

type Handler = (request: HandlerParams) => Promise<any|SSEResponse>;
type Routes = Record<string, Handler>;

async function loadAllRoutesHandlers(routes: string): Promise<Routes> {

	const routes_uri = await getAllRoutes(routes);

	type Module = {default: Handler};
	const handlers   = Object.fromEntries( await Promise.all( routes_uri.map( async (uri) => {
		let module: Module = await import(uri);

		return [uri.slice(routes.length, - ".ts".length), module.default];
	})));

	return handlers;
}

async function getAllRoutes(currentPath: string): Promise<string[]> {

	const files: string[] = [];

	for await (const dirEntry of Deno.readDir(currentPath)) {

		const entryPath = `${currentPath}/${dirEntry.name}`;

		if ( ! dirEntry.isDirectory)
			files.push( entryPath )
		else
			files.push(... await getAllRoutes(entryPath));

	}

	return files;
}

type REST_Methods = "POST"|"GET"|"DELETE"|"PUT"|"PATCH";

function buildRequestHandler(routes: Routes) {

	const regexes = Object.entries(routes).map( ([uri, handler]) => [path2regex(uri), handler, uri] as const);

	return async function(request: Request): Promise<Response> {

		try {

			const method = request.method as REST_Methods;
			const url = new URL(request.url);

			const route = getRouteHandler(regexes, method, url);
			if(route === null)
				return new Response('404 Not Found', {status: 404});

			let body_params = {};
			let body = await read_body(request);

			if(body !== null)
				body = JSON.parse(body);

			const answer = await route.handler({url, body, route});

			if(answer instanceof SSEResponse) {
				return new Response(answer._body, {headers: {"content-type": "text/event-stream", "Access-Control-Allow-Origin": "*"} } )
			}

			return new Response( JSON.stringify(answer, null, 4), {headers: {"Access-Control-Allow-Origin": "*"} } );

		} catch(e) {

			console.error(e);

			let error_code = 500;
			if( e instanceof HTTPError )
				error_code = e.error_code;

			return new Response( e.message, {status: error_code, headers: { "Access-Control-Allow-Origin": "*" }} );
		}
	};
}

async function read_body(request: Request) {

	const body = request.body;
	if(body === null)
		return null;

	let result = "";

	// Because it would have been too simple if we had a simple API... JS = Baka
	const decoder = new TextDecoder();
	const body_reader = body.getReader();
	let chunk!: {done: boolean, value?: Uint8Array};
	while( ! (chunk = await body_reader.read()).done )
		result += decoder.decode(chunk.value, {stream: true});

	result += decoder.decode();

	return result;
}


// tests

function path2regex(path: string) {

	// Escape special characters.
	// cf https://stackoverflow.com/questions/3115150/how-to-escape-regular-expression-special-characters-using-javascript
	path = path.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

	return new RegExp("^" + path.replace(/\\\{[^\}]+\\\}/g, (captured) => `(?<${captured.slice(2,-2)}>[^/]+)`) + "$");
}

function match(regex: RegExp, uri: string) {

	let result = regex.exec(uri);

	if(result === null)
		return false;

	return result.groups ?? {};
}

function getRouteHandler(regexes: (readonly [RegExp, Handler, string])[], method: REST_Methods, url: URL) {

	let curRoute = `${url.pathname}/${method}`;

	for(let route of regexes) {

		var vars = match(route[0], curRoute);

		if(vars !== false)
			return {
				handler: route[1],
				path   : route[2],
				vars
			};
	}

	return null;
}