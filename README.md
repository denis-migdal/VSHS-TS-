## Examples

You can run the examples from the section below, simply by running the server given in the `./examples` directory:

```shell
deno task --cwd examples/ start
```

You can then send HTTP queries to the server with the command `curl`:

```shell
curl -X $HTTP_METHOD -d "$BODY" -w "\n\nStatus code:%{http_code}\n" "$URL"
```

For development purposes, you can execute the tests with :

```shell
deno task --cwd examples/ test
```

## Usage

To create a new HTTP server, just call the function `startHTTPServer()`:

```typescript
import startHTTPServer from "VSHS";

startHTTPServer({
  port: 8080,
  hostname: 'localhost',
  routes: '/routes'
});
```

### Routes and handlers

The `routes` parameter is a directory containing the differents routes your HTTP server will answer to. In this directory, each subdirectory corresponds to a route, and each files, to a supported HTTP method for this route.

For example, the file `./routes/hello-world/GET.ts` defines how your server will answer to a `GET /hello-world` HTTP query. In order to do so, `GET.ts` default exports an asynchronous function whose return value is the answer to the received HTTP query.

```typescript
export default async function() {
    return {message: "Hello World"};
}
```

```shell
curl -w "\n" -X GET http://localhost:8080/hello-world
```

***Output:***

```
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
            url,      // URL: the requested URL
            // ( cf https://developer.mozilla.org/en-US/docs/Web/API/URL )
            body,      // any|null: JSON.parse( query.body ) or null if empty body.
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
curl -w "\n" -X POST -d '{"body": "A"}' http://localhost:8080/params/C?url=B
```

***Output:***

```
{
    "urlParams": {
        "url": "B"
    },
    "bodyParams": {
        "body": "A"
    },
    "pathParams": {
        "name": "C"
    }
}
```

⚠ Some brower might forbid to add body to GET queries.

### Routes variables

The `route` parameter has two components:

- `path` is the route path, e.g. `/params/{name}/GET.ts`. Letters in between braces represents a variable, corresponding to set of letters (except `/`). Hence a single route path can match several URL, e.g.:
  
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

```shell
curl -w "\n\nStatus code: %{http_code}\n" -X GET http://localhost:8080/exception
```

***Output:***

```
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

```shell
curl -w "\n\nStatus code: %{http_code}\n" -X GET http://localhost:8080/http-error
```

***Output:***

```
Forbidden Access

Status code: 403
```

💡 If it exists, errors are redirected to the `/errors/{error_code}` route, with `body` containing the error message.

### Mime-type

#### In the response

We infer the response's `Content-Type` from the handler return value :

| Return            | Mime                                              |
| ----------------- | ------------------------------------------------- |
| `string`          | `text/plain`                                      |
| `URLSearchParams` | `application/x-www-form-urlencoded`               |
| `FormData`        | `application/x-www-form-urlencoded`               |
| `Uint8Array`      | `application/octet-stream`                        |
| `Blob`            | `blob.type`<br/>or<br/>`application/octet-stream` |
| `any`             | `application/json`                                |
| `SSEResponse`     | `text/event-stream`                               |

#### In the query

We automatically perform the following conversions on the query body:

| Mime                                | Result               |
| ----------------------------------- | -------------------- |
| No body                             | `null`               |
| `text/plain`                        | `string` or `Object` |
| `application/x-www-form-urlencoded` | `Object`             |
| `application/json`                  | `Object`             |
| `application/octet-stream`          | `Uint8Array`         |
| others                              | `Blob`               |

⚠ For `text/plain` and `application/x-www-form-urlencoded`, we first try to parse it with `JSON.parse()`.

💡 The default mime-types set by the client are :

| Source            | Mime-type                           |
| ----------------- | ----------------------------------- |
| `string`          | `text/plain`                        |
| `URLSearchParams` | `application/x-www-form-urlencoded` |
| `FormData`        | `application/x-www-form-urlencoded` |
| `Uint8Array`      | None                                |
| `Blob`            | `blob.type` or none                 |
| `curl -d`         | `application/x-www-form-urlencoded` |

💡 To provide an explicit mime-type in the query :

```typescript
fetch('...', {body: ..., headers: {"Content-Type", "..."})
```

```shell
curl -d "..." -H "Content-Type: ..."
```

### Static ressources

You can also provide a directory containing static files 

```ts
startHTTPServer({
  port: 8080,
  hostname: 'localhost',
  routes: '/routes',
  static: '/assets'
});
```

```shell
curl -w "\n\nType: %{content_type}\n" -X GET http://localhost:8080/
```

***Output:***

```
<b>Hello world</b>

Type: text/html
```

### Server-Sent Events

If you want to return [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events), you just have to return an instance of `SSEResponse`:

```typescript
import { SSEResponse } from "../../../HTTPServer.ts";

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
```

The method `send(message: any, event?: string)` sends a new event to the client. Once the client closes the connection, the callback registered in `self.onConnectionClosed` is called.

```shell
curl -X GET http://localhost:8080/server-sent-events
```

***Output:***

```
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

- `GET /demo/website` to receive Server-Sent Events at each modification of `./examples/messages.txt`.
- `POST /demo/website` to append a new line into `./examples/messages.txt` at each submission of the formular.
