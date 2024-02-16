function uint_equals(a: Uint8Array, b: Uint8Array) {

	if(b.byteLength !== b.byteLength)
		return false;

	for(let i = 0; i < a.byteLength; ++i)
		if(a.at(i) !== b.at(i))
			return false;
	return true;
}

async function assertResponse(response: Response, status: number, mime: string|null, content: null|string|Uint8Array) {

	if(response.status !== status)
		throw new Error(`\x1b[1;31mWrong status code:\x1b[0m
\x1b[1;31m- ${response.status}\x1b[0m
\x1b[1;32m+ ${status}\x1b[0m`);

	let rep_mime = response.headers.get('Content-Type');
	if( mime === null && rep_mime === "application/octet-stream")
		rep_mime = null;
	if( rep_mime !== mime )
		throw new Error(`\x1b[1;31mWrong mime-type:\x1b[0m
\x1b[1;31m- ${rep_mime}\x1b[0m
\x1b[1;32m+ ${mime}\x1b[0m`);

	if( content instanceof Uint8Array ) {
		const rep = new Uint8Array(await response.arrayBuffer());
		if( ! uint_equals(content, rep) )
			throw new Error(`\x1b[1;31mWrong body:\x1b[0m
\x1b[1;31m- ${rep}\x1b[0m
\x1b[1;32m+ ${content}\x1b[0m`);
	} else {

		const rep_text = await response.text();
		if( rep_text !== content)
			throw new Error(`\x1b[1;31mWrong body:\x1b[0m
\x1b[1;31m- ${rep_text}\x1b[0m
\x1b[1;32m+ ${content}\x1b[0m`);
	}
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

Deno.test("exception", async() => {

	const answer = await fetch('http://localhost:8080/exception');

	await assertResponse(answer, 500, "text/plain", `Oups...`);

});

Deno.test("HTTPError", async() => {

	const answer = await fetch('http://localhost:8080/http-error');

	await assertResponse(answer, 403, "text/plain", `Forbidden Access`);

});


Deno.test("/", async() => {

	const answer = await fetch('http://localhost:8080/');

	await assertResponse(answer, 200, "text/html", `<b>Hello world</b>`);

});

Deno.test("querytype", async (t) => {

	await t.step('none', async () => {
		const answer = await fetch('http://localhost:8080/querytype', {method:"POST"});
		await assertResponse(answer, 200, "text/plain", "null");
	});

	await t.step('string', async () => {
		const answer = await fetch('http://localhost:8080/querytype', {method:"POST", body: "str"});
		await assertResponse(answer, 200, "text/plain", "String");
	});
	await t.step('URLSearchParams', async () => {
		const answer = await fetch('http://localhost:8080/querytype', {method:"POST", body: new URLSearchParams({e: '42'})});
		await assertResponse(answer, 200, "text/plain", "Object");
	});

	await t.step('Uint8Array', async () => {
		const answer = await fetch('http://localhost:8080/querytype', {method:"POST", body: new Uint8Array([0,1])});
		await assertResponse(answer, 200, "text/plain", "Uint8Array");
	});

	await t.step('Blob', async () => {
		const answer = await fetch('http://localhost:8080/querytype', {method:"POST", body: new Blob(["e"], {type:"toto"})});
		await assertResponse(answer, 200, "text/plain", "toto");
	});
});

Deno.test("echo", async (t) => {

	await t.step('none', async () => {
		const answer = await fetch('http://localhost:8080/echo', {method:"POST"});
		await assertResponse(answer, 200, null, "");
	});

	await t.step('string', async () => {
		const answer = await fetch('http://localhost:8080/echo', {method:"POST", body: "str"});
		await assertResponse(answer, 200, "text/plain", "str");
	});
	await t.step('URLSearchParams', async () => {
		const answer = await fetch('http://localhost:8080/echo', {method:"POST", body: new URLSearchParams({e: '42'})});
		await assertResponse(answer, 200, "application/json", `{
    "e": "42"
}`);
	});

	await t.step('Uint8Array', async () => {
		const bytes = new Uint8Array([0,1]);
		const answer = await fetch('http://localhost:8080/echo', {method:"POST", body: bytes});
		await assertResponse(answer, 200, "application/octet-stream", bytes);
	});

	await t.step('Blob', async () => {
		const answer = await fetch('http://localhost:8080/echo', {method:"POST", body: new Blob(["e"], {type:"toto"})});
		await assertResponse(answer, 200, "toto", "e");
	});
});