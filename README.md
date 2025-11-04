# ECE312 Simple Webserver

This repository holds course posts and resources. A minimal Node.js server is included to serve files from `resources/` and to accept `POST`/`PUT` requests which write into `posts/`. Note that the server must have write permissions to the `posts/` directory, so if you are using user www-data for the server you will need to give that user/group write permissions to the posts directory.

Start the server:

```bash
npm install   # optional, no dependencies
npm start
```

Examples:

- Serve a resource file (GET):

```bash
curl http://localhost:8080/image.png --output image.png
```

- Create or overwrite a post (POST):

```bash
curl -X POST http://localhost:8080/2025-11-03-sample.md -d '# Sample Post' -H "Content-Type: text/markdown"
```

- Update a post (PUT):

```bash
curl -X PUT http://localhost:8080/2025-11-03-sample.md -d '# Updated Content'
```

Notes on ports and running on port 80

By default the server listens on port 8080 for development. To bind to port 80 (the standard HTTP port) you can:


```bash
PORT=80 npm start
```

	- Use a reverse proxy (nginx) to forward traffic from port 80 → 8080.
	- Use port forwarding / iptables to redirect port 80 to 8080.
	- Grant Node the ability to bind low ports (e.g., `sudo setcap 'cap_net_bind_service=+ep' $(which node)`) — consider security implications.

Running as a systemd service
----------------------------

This repo includes a `deploy/ece312-webserver.service` systemd unit template and a `deploy/README.md` with steps to install and enable the service. Edit the `WorkingDirectory` and `User` fields in the unit file before enabling.

