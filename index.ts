type HTTPServerOpts = {
	port: number,
	hostname: string,
	routes: string
};


export function rootDir() {
	return Deno.cwd();
}

export default async function startHTTPServer({port = 8080, hostname = "localhost", routes = "/routes"}: HTTPServerOpts) {

	if(routes[0] === "/")
		routes = rootDir() + routes;

	const routesHandlers = await loadAllRoutesHandlers(routes);
	const requestHandler = buildRequestHandler(routesHandlers);

	// https://docs.deno.com/runtime/tutorials/http_server
	await Deno.serve({ port, hostname }, requestHandler).finished;
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

	#controller?: ReadableStreamDefaultController;

	#stream = new ReadableStream({

		start: (controller: any) => {
			this.#controller = controller;
		},
		cancel: () => {
			this.onConnectionClosed?.();
		}
	});

	onConnectionClosed: null| (() => Promise<void>|void) = null;

	constructor(run: (self: SSEResponse) => Promise<void>) {
		run(this);
	}

	get _body() {
		return this.#stream;
	}

	async send(data: any, event?: string) {

		// JSON.stringify is required to escape characters.
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

	const ROOT = rootDir();
	const routes_uri = await getAllRoutes(routes);

	type Module = {default: Handler};
	const handlers   = Object.fromEntries( await Promise.all( routes_uri.map( async (uri) => {

		// only with imports map, but bugged
		// https://github.com/denoland/deno/issues/22237
		//if( uri.startsWith(ROOT) )
		//	uri = uri.slice(ROOT.length)

		if( uri[1] === ':' ) // windows drive
			uri = `file://${uri}`;

		let module!: Module;
		try{
			module = await import(uri);
		} catch(e) {
			console.error(e);
		}
		


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

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "POST, GET, PATCH, PUT, OPTIONS, DELETE"
};

function buildRequestHandler(routes: Routes) {

	const regexes = Object.entries(routes).map( ([uri, handler]) => [path2regex(uri), handler, uri] as const);

	return async function(request: Request): Promise<Response> {

		try {

			const method = request.method as REST_Methods | "OPTIONS";

			if(method === "OPTIONS")
				return new Response(null, {headers: CORS_HEADERS});

			const url = new URL(request.url);

			const route = getRouteHandler(regexes, method, url);
			if(route === null)
				throw new HTTPError(404, 'Not Found');

			let body = request.body;

			if(body !== null) {

				let txt = await request.text();
				if( txt !== "")
					body = JSON.parse(txt);
			}

			let answer = await route.handler({url, body, route});

			if(answer instanceof SSEResponse)
				return new Response(answer._body, {headers: {"content-type": "text/event-stream", ...CORS_HEADERS} } )

			let content_type = "text/plain";
			if( typeof answer !== "string" ) {
				answer = JSON.stringify(answer, null, 4);
				content_type = "application/json";
			}

			return new Response( answer, {headers: {"content-type": content_type, ...CORS_HEADERS}} );

		} catch(e) {


			let error_code = 500;
			if( e instanceof HTTPError )
				error_code = e.error_code;
			else
				console.error(e);

			return new Response( e.message, {status: error_code, headers: CORS_HEADERS} );
		}
	};
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