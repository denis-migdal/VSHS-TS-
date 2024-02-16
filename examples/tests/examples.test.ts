async function assertResponse(response: Response, status: number, mime: string, content: string) {

	if(response.status !== status)
		throw new Error(`\x1b[1;31mWrong status code:\x1b[0m
\x1b[1;31m- ${response.status}\x1b[0m
\x1b[1;32m- ${status}\x1b[0m`);

	const rep_mime = response.headers.get('Content-Type');
	if( rep_mime !== mime)
		throw new Error(`\x1b[1;31mWrong mime-type:\x1b[0m
\x1b[1;31m- ${rep_mime}\x1b[0m
\x1b[1;32m- ${mime}\x1b[0m`);

	const rep_text = await response.text();
	if( rep_text !== content)
		throw new Error(`\x1b[1;31mWrong body:\x1b[0m
\x1b[1;31m- ${rep_text}\x1b[0m
\x1b[1;32m- ${content}\x1b[0m`);
}

Deno.test("hello-world", async() => {

	const answer = await fetch('http://localhost:8080/hello-world');

	await assertResponse(answer, 200, "application/json", `{
    "message": "Hello World"
}`);

});

Deno.test("params", async() => {

	const answer = await fetch('http://localhost:8080/params/C?url=B', {
		method: "POST",
		body: JSON.stringify({body: "A"})
	});

	await assertResponse(answer, 200, "application/json", `{
    "urlParams": {
        "url": "B"
    },
    "bodyParams": {
        "body": "A"
    },
    "pathParams": {
        "name": "C"
    }
}`);

});
