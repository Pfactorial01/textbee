import json
import threading
import socket
import select
from http.server import BaseHTTPRequestHandler, HTTPServer
from queue import Queue
from queue import Empty


SOCKS_VERSION = 5

# Add these global variables at the top level
url_queue = Queue()
html_queue = Queue()

class Proxy:
    def __init__(self, username, password):
        self.username = username
        self.password = password
        self.server = None  # Add a server attribute to the Proxy class

    def handle_client(self, connection):
        # greeting header
        # read and unpack 2 bytes from a client
        version, nmethods = connection.recv(2)

        # get available methods [0, 1, 2]
        methods = self.get_available_methods(nmethods, connection)

        # accept only USERNAME/PASSWORD auth
        if 2 not in set(methods):
            # close connection
            connection.close()
            return

        # send welcome message
        connection.sendall(bytes([SOCKS_VERSION, 2]))

        if not self.verify_credentials(connection):
            print("no auth")
            return

        # request (version=5)
        version, cmd, _, address_type = connection.recv(4)

        if address_type == 1:  # IPv4
            address = socket.inet_ntoa(connection.recv(4))
        elif address_type == 3:  # Domain name
            domain_length = connection.recv(1)[0]
            address = connection.recv(domain_length)
            address = socket.gethostbyname(address)

        # convert bytes to unsigned short array
        port = int.from_bytes(connection.recv(2), 'big', signed=False)

        try:
            if cmd == 1:  # CONNECT
                remote = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                remote.connect((address, port))
                bind_address = remote.getsockname()
                print("* Connected to {} {}".format(address, port))
            else:
                connection.close()

            addr = int.from_bytes(socket.inet_aton(bind_address[0]), 'big', signed=False)
            port = bind_address[1]

            reply = b''.join([
                SOCKS_VERSION.to_bytes(1, 'big'),
                int(0).to_bytes(1, 'big'),
                int(0).to_bytes(1, 'big'),
                int(1).to_bytes(1, 'big'),
                addr.to_bytes(4, 'big'),
                port.to_bytes(2, 'big')
            ])
        except Exception as e:
            # return connection refused error
            reply = self.generate_failed_reply(address_type, 5)

        connection.sendall(reply)

        # establish data exchange
        if reply[1] == 0 and cmd == 1:
            self.exchange_loop(connection, remote)

        connection.close()


    def exchange_loop(self, client, remote):
        while True:
            # wait until client or remote is available for read
            r, w, e = select.select([client, remote], [], [])

            if client in r:
                data = client.recv(4096)
                if remote.send(data) <= 0:
                    break

            if remote in r:
                data = remote.recv(4096)
                if client.send(data) <= 0:
                    break


    def generate_failed_reply(self, address_type, error_number):
        return b''.join([
            SOCKS_VERSION.to_bytes(1, 'big'),
            error_number.to_bytes(1, 'big'),
            int(0).to_bytes(1, 'big'),
            address_type.to_bytes(1, 'big'),
            int(0).to_bytes(4, 'big'),
            int(0).to_bytes(4, 'big')
        ])


    def verify_credentials(self, connection):
        version = ord(connection.recv(1)) # should be 1

        username_len = ord(connection.recv(1))
        username = connection.recv(username_len).decode('utf-8')

        password_len = ord(connection.recv(1))
        password = connection.recv(password_len).decode('utf-8')
        if username == self.username and password == self.password:
            # success, status = 0
            response = bytes([version, 0])
            connection.sendall(response)
            return True

        # failure, status != 0
        response = bytes([version, 0xFF])
        connection.sendall(response)
        connection.close()
        return False


    def get_available_methods(self, nmethods, connection):
        methods = []
        for i in range(nmethods):
            methods.append(ord(connection.recv(1)))
        return methods

    def run(self, host, port):
        if type(port) is str:
            port = port.split(".")
            port = int(port[0])

        self.server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server.settimeout(1.0)  # Set a timeout on the socket
        try:
            self.server.bind((host, port))
            self.server.listen()

            print(f"* Socks5 proxy server is running on {host}:{port}")

            while True:
                try:
                    conn, addr = self.server.accept() # This will now timeout if no connection within 1 sec
                    print(f"* new connection from {addr}")
                    t = threading.Thread(target=self.handle_client, args=(conn,))
                    t.start()
                except socket.timeout: # Handle the timeout exception
                    if self.server is None: # Check if the server was explicitly set to None (stopped)
                        break # If stopped, exit the loop
                except OSError as e: # Catch OSError, likely due to the socket being closed
                    if self.server is None: # Check if the server was explicitly set to None (stopped)
                       break # If stopped, exit the loop
                    else:
                       raise e # Re-raise the exception if it wasn't due to a stop.
        finally:
           if self.server:
               self.server.close()
               self.server = None # Important: Set to None *before* joining the thread
               print("* Socks5 proxy server stopped.")

    def stop(self):
        if self.server:
            self.server.close()  # Close the socket to trigger the exception.
            self.server = None  # Set it to None to signal the thread to exit.
            print("* Stopping proxy server...")

HOST = "0.0.0.0"
PORT = 8080

proxy_instance = None  # Global variable to store proxy instance
proxy_thread = None  # Global variable to store the proxy thread

def start_proxy(username, password, port):
    global proxy_instance, proxy_thread

    if proxy_instance:  # Stop the existing proxy server if one is running
        proxy_instance.stop()
        if proxy_thread:
            proxy_thread.join() # Wait for the thread to fully exit.  Crucial!
        proxy_instance = None
        proxy_thread = None

    proxy_instance = Proxy(username, password)
    proxy_thread = threading.Thread(target=proxy_instance.run, args=("0.0.0.0", port), daemon=True)
    proxy_thread.start()

class ProxyConfigHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers["Content-Length"])
        post_data = self.rfile.read(content_length)
        try:
            data = json.loads(post_data.decode("utf-8"))
            username = data.get("username")
            password = data.get("password")
            port = data.get("port")

            if not all([username, password, port]):
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"Missing parameters")
                return

            start_proxy(username, password, port)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Proxy server updated successfully")
        except json.JSONDecodeError:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Invalid JSON")

    def do_GET(self):
        if self.path.startswith('/fetch?url='):
            print("processing scraping request")
            try:
                # Extract URL from query parameter
                from urllib.parse import urlparse, parse_qs
                params = parse_qs(urlparse(self.path).query)
                url = params['url'][0]

                # Clear the html_queue to prevent stale responses
                while not html_queue.empty():
                    html_queue.get_nowait()

                # Put URL in queue for Android to process
                url_queue.put(url)
                
                # Wait for result from Android
                try:
                    # Use get_nowait() first to check if queue is empty
                    html = html_queue.get(timeout=60)  # 60 second timeout
                    self.send_response(200)
                    self.send_header('Content-type', 'text/html')
                    self.end_headers()
                    self.wfile.write(html.encode())
                except Empty:
                    self.send_response(504)  # Gateway Timeout
                    self.end_headers()
                    self.wfile.write(b"Timeout waiting for WebView")
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(str(e).encode())

class MyServer:
    def __init__(self, username, password, port):
        self.username = username
        self.password = password
        self.port = port

    def run(self):
        start_proxy(self.username, self.password, self.port) #Start proxy initially
        server = HTTPServer((HOST, PORT), ProxyConfigHandler)
        print(f"HTTP server running on {HOST}:{PORT}")
        server.serve_forever()