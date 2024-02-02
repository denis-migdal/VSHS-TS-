import startHTTPServer from "VSHS";

startHTTPServer({
  port: 8080,
  hostname: 'localhost',
  routes: `${Deno.cwd()}/routes`
});