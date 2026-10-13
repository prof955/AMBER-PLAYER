#!/usr/bin/env python3
"""
tools/serve.py — local static server for CHIPTUNE CONSOLE.

Why not `python3 -m http.server`? Because it sends no CORS headers, and the
console is routinely embedded in sandboxed iframes (live previews, docs demos).
A sandboxed frame without `allow-same-origin` runs with an **opaque origin**, and
in that mode the browser CORS-checks every module script, dynamic import() and
fetch() — including the .wasm engines. GitHub Pages sends
`Access-Control-Allow-Origin: *` on every file, so it just works there; this
server makes local testing behave the same way.

Usage:
    python3 tools/serve.py            # http://localhost:8088
    python3 tools/serve.py 9000       # another port
"""
import http.server
import socketserver
import sys
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8088


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def guess_type(self, path):
        # make sure the engines get the MIME type WebAssembly.instantiateStreaming wants
        if str(path).endswith('.wasm'):
            return 'application/wasm'
        if str(path).endswith('.mjs'):
            return 'text/javascript'
        return super().guess_type(path)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cross-Origin-Resource-Policy', 'cross-origin')
        # dev server: never let a stale bundle fool us during testing
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def log_message(self, fmt, *args):
        # keep the console readable: only report errors
        if not str(args[1] if len(args) > 1 else '').startswith('2'):
            super().log_message(fmt, *args)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    os.chdir(ROOT)
    with Server(('0.0.0.0', PORT), Handler) as httpd:
        print(f'CHIPTUNE CONSOLE served from {ROOT}')
        print(f'  http://localhost:{PORT}/        (CORS açık: sandbox’lı iframe’lerde de çalışır)')
        httpd.serve_forever()
