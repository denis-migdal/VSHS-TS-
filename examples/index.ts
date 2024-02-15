import startHTTPServer from "VSHS";

startHTTPServer({
  port: 8080,
  hostname: 'localhost',
  routes: '/routes',
  static: '/assets'
});