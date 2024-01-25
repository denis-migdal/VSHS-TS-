import startHTTPServer from "VSHS";

startHTTPServer({
  port: 8080,
  hostname: '127.0.0.1',
  routes: `${Deno.cwd()}/routes`
});