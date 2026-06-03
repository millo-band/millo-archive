import os, sys, socket, socketserver
os.chdir(os.path.dirname(os.path.abspath(__file__)))
port = int(os.environ.get('PORT', 7822))
from http.server import SimpleHTTPRequestHandler
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('', port), SimpleHTTPRequestHandler) as s:
    print(f'Serving on port {port}', flush=True)
    s.serve_forever()
