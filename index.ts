type Logger = (ip: string, method: string, url: URL, error: null|HTTPError|Error) => void;

type HTTPServerOpts = {
	port: number,
	hostname: string,
	routes: string|Routes,
	static?: string,
	logger?: Logger // not documented
};


export function rootDir() {
	return Deno.cwd();
}

export default async function startHTTPServer({ port = 8080,
												hostname = "localhost",
												routes = "/routes",
												static: _static,
												logger = () => {}
											}: HTTPServerOpts) {

	let routesHandlers: Routes = routes as any;
	if( typeof routes === "string" ) {
		if(routes[0] === "/")
			routes = rootDir() + routes;
			
		routesHandlers = await loadAllRoutesHandlers(routes);
	}
	
	if(_static?.[0] === "/")
		_static = rootDir() + _static;
	
	const requestHandler = buildRequestHandler(routesHandlers, _static, logger);

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

async function buildAnswer(http_code: number,
						   response: string|SSEResponse|any,
						   mime: string|null = null) {

	switch (true) {
		case response === null || response === undefined:
			response = null;
			mime =  null;
			break;
		case response instanceof SSEResponse: 
			response = response._body;
			mime =  "text/event-stream";
			break;
		case typeof response === "string": 
			mime ??= "text/plain";
			break;
		case response instanceof FormData:
			response = new URLSearchParams(response as any)
		case response instanceof URLSearchParams:
			mime = "application/x-www-form-urlencoded"
			response = response.toString();
			break;
		case response instanceof Uint8Array:
			mime ??= "application/octet-stream";
			break;
		case response instanceof Blob:
			mime ??= response.type ?? "application/octet-stream";
			response = await response.arrayBuffer();
			break;
		default:
			response = JSON.stringify(response, null, 4);
			mime = "application/json";
	}

	const headers: HeadersInit = {...CORS_HEADERS};
	if(mime !== null)
		headers["content-type"] = mime;

	return new Response( response, {status: http_code,
									headers} );
}

async function parseBody(request: Request) {

	if( request.body === null)
		return null;

	let content_type = request.headers.get('Content-Type');
	if( content_type === null || content_type === 'application/octet-stream') {

		const buffer = await request.arrayBuffer();

		if(buffer.byteLength === 0)
			return null;

		return new Uint8Array(buffer);
	}

	const [mime] = content_type.split(';')

	if( ["text/plain", "application/json", "application/x-www-form-urlencoded"].includes(mime) ) {

		const text = await request.text();
		if( text === "")
			return null;

		try {
			return JSON.parse(text);
		} catch(e) {

			if( mime === "application/json" )
				throw e;
			if( mime === "application/x-www-form-urlencoded")
				return Object.fromEntries(new URLSearchParams(text).entries() );
			return text;
		}
	}

	const buffer = await request.arrayBuffer()
	if(buffer.byteLength === 0)
		return null;

	return new Blob([buffer], {type: mime});
}

import { mimelite } from "https://deno.land/x/mimetypes@v1.0.0/mod.ts";
function buildRequestHandler(routes: Routes, _static?: string, logger?: Logger) {

	const regexes = Object.entries(routes).map( ([uri, handler]) => [path2regex(uri), handler, uri] as const);

	return async function(request: Request, connInfo: any): Promise<Response> {

		const ip = connInfo.remoteAddr.hostname;

		const url = new URL(request.url);
		let error = null;
		const method = request.method as REST_Methods | "OPTIONS";

		try {

			if(method === "OPTIONS")
				return new Response(null, {headers: CORS_HEADERS});

			const route = getRouteHandler(regexes, method, url);
			if(route === null) {
			
				if( _static === undefined )
					throw new HTTPError(404, "Not found");

				let filepath = `${_static}/${url.pathname}`;
				let content!: Uint8Array;

				try {
					const info = await Deno.stat(filepath);

					if( info.isDirectory )
						filepath = `${filepath}/index.html`;

					content = await Deno.readFile(filepath);

				} catch(e) {

					if(e instanceof Deno.errors.NotFound)
						throw new HTTPError(404, "Not Found");
					if( e instanceof Deno.errors.PermissionDenied )
						throw new HTTPError(403, "Forbidden");
					
					throw new HTTPError(500, e.message);
				}

				const parts = filepath.split('.');
				const ext = parts[parts.length-1];

				const mime = mimelite.getType(ext) ?? "text/plain";
				
				return await buildAnswer(200, content, mime);
			}

			const body = await parseBody(request);
			let answer = await route.handler({url, body, route});

			return await buildAnswer(200, answer);

		} catch(e) {

			error = e;

			let error_code = 500;
			if( e instanceof HTTPError )
				error_code = e.error_code;
			else
				console.error(e);

			const error_url = new URL(`/errors/${error_code}`, url);
			const route = getRouteHandler(regexes, "GET", error_url);
			let answer  = e.message;
			if(route !== null) {
				try{
					answer = await route.handler({url, body: e.message, route});	
				} catch(e) {
					console.error(e); // errors handlers shoudn't raise errors...
				}
			}

			return await buildAnswer(error_code, answer);
		} finally {
			if( logger !== undefined )
				logger(ip, method, url, error);
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

	let curRoute = `${ decodeURI(url.pathname) }/${method}`;

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
