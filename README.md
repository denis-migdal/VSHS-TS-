## Examples

You can test the examples from the section below, simply by running the server given in the `./examples` directory:
```shell
cd ./examples
deno run --check --unstable --allow-read --allow-write --allow-net --allow-run index.ts
```

You can then send HTTP queries to the server with the command `curl`:
```shell
curl -X $HTTP_METHOD -d "$BODY" -w "\n\nStatus code:%{http_code}\n" "$URL"
```

## Usage

To create a new HTTP server, just call the function `startHTTPServer()`:
```typescript
import startHTTPServer from "VSHS";

startHTTPServer({
  port: 8080,
  hostname: '127.0.0.1',
  routes: `${Deno.cwd()}/routes`
});
```

### Routes and handlers

The `routes` parameter is a directory containing the differents routes your HTTP server will answer to. In this directory, each subdirectory corresponds to a route, and each files, to a supported HTTP method for this route.

For example, the file `./routes/foo/GET.ts` defines how your server will answer to a `GET /foo` HTTP query. In order to do so, `GET.ts` default exports an asynchronous function whose return value is the answer to the received HTTP query.

```typescript
export default async function() {
	return {message: "Hello World"};
}
```

```shell
$ curl -w "\n" -X GET http://localhost:8080/foo
{
	"message": "Hello World"
}
```

### Handler parameters

In fact, the handler function takes a `HandlerParams` parameter:
```typescript
import { HandlerParams } from "VSHS";

export default async function(
		{
			url,	  // URL: the requested URL
			// ( cf https://developer.mozilla.org/en-US/docs/Web/API/URL )
			body,	  // any|null: JSON.parse( query.body ) or null if no body.
			route: {// cf next section
				path  // string
				vars  // Record<string, string>
			}
		}: HandlerParams			
	) {

	return {
		urlParams : Object.fromEntries(url.searchParams.entries()),
		bodyParams: body,
		pathParams: vars
	};
}
```

```shell
$ curl -w "\n" -X POST -d '{"body": "A"}' http://localhost:8080/params/C?url=B
{
    "urlParams": {
        "url": "B"
    },
    "bodyParams": {
        "body": "A"
    },
    "pathParams": {
        "route": "C"
    }
}
```

### Routes variables

The `route` parameter has two components:

- `path` is the route path, e.g. `/foo/{name}/GET.ts`. Letters in between braces represents a variable, corresponding to set of letters (except `/`). Hence a single route path can match several URL, e.g.:
  - `/params/faa`
  - `/params/fuu`

- `vars` is an object whose keys are the path variables names and whose values their values in the current URL, e.g.:
  - `{name: "faa"}`
  - `{name: "fuu"}`


### HTTP Error Code

If an exception is thrown inside an handlers, the server will automatically send an HTTP 500 status code (Internal Server Error).

```typescript
export default async function() {
	throw new Error('Oups...');
}
```

```bash
$ curl -w "\n\nStatus code: %{http_code}\n" -X GET http://localhost:8080/exception
Oups...

Status code: 500
```

You can send other HTTP status code, by throwing an instance of `HTTPError`:
```typescript
import {HTTPError} from "VSHS";

export default async function() {
	throw new HTTPError(403, "Forbidden Access");
}
```

```bash
$ curl -w "\n\nStatus code: %{http_code}\n" -X GET http://localhost:8080/http-error
Forbidden Access

Status code: 403
```

### Server-Sent Events

If you want to return [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events), you just have to return an instance of `SSEResponse`:
```typescript
import { SSEResponse } from "../../../HTTPServer.ts";

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
```

The method `send(message: any, event?: string)` sends a new event to the client. Once the client closes the connection, the callback given in the constructor is called.

```typescript
import {HTTPError} from "VSHS";

export default async function() {
	throw new HTTPError(403, "Forbidden Access");
}
```

```bash
$ curl -X GET http://localhost:8080/server-sent-events
event: event_name
data: {"count":0}

event: event_name
data: {"count":1}

event: event_name
data: {"count":2}
```

## Demo Messages.html

We also provide an additionnal demonstration in `./examples/demo/`.

This webpage sends two HTTP queries :
- `GET /messages/website` to receive Server-Sent Events at each modification of `./examples/messages.txt`.
- `POST /messages/website` to append a new line into `./examples/messages.txt` at each submission of the formular.