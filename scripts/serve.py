"""Kleine lokale ontwikkelserver met betrouwbare MIME-types voor ES-modules."""

import http.server
import mimetypes

mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("application/geo+json", ".geojson")

if __name__ == "__main__":
    http.server.ThreadingHTTPServer(
        ("127.0.0.1", 8766), http.server.SimpleHTTPRequestHandler
    ).serve_forever()
