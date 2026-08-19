#!/usr/bin/env python3
"""Proves §43: staff action pushes a live event to the customer receipt socket.

Opens the customer's receipt WebSocket, triggers Call Next as staff over HTTP,
and reports whatever frames actually arrive. No mocking: a real socket against
the running backend. Uses only the stdlib (no websockets package on this box).
"""
import base64, json, os, socket, ssl, struct, sys, threading, time, urllib.request

API = os.environ.get("QLIO_API", "localhost:8087")
HOST, PORT = API.split(":")[0], int(API.split(":")[1])


def ws_connect(path):
    s = socket.create_connection((HOST, PORT), timeout=10)
    key = base64.b64encode(os.urandom(16)).decode()
    req = (
        f"GET {path} HTTP/1.1\r\nHost: {API}\r\nUpgrade: websocket\r\n"
        f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n\r\n"
    )
    s.sendall(req.encode())
    buf = b""
    while b"\r\n\r\n" not in buf:
        chunk = s.recv(4096)
        if not chunk:
            raise RuntimeError("closed during handshake")
        buf += chunk
    status = buf.split(b"\r\n")[0].decode()
    if "101" not in status:
        raise RuntimeError(f"upgrade failed: {status}")
    return s, status


def read_frame(s):
    """Minimal RFC6455 reader: text frames, server->client (unmasked)."""
    hdr = s.recv(2)
    if len(hdr) < 2:
        return None
    op = hdr[0] & 0x0F
    ln = hdr[1] & 0x7F
    if ln == 126:
        ln = struct.unpack(">H", s.recv(2))[0]
    elif ln == 127:
        ln = struct.unpack(">Q", s.recv(8))[0]
    payload = b""
    while len(payload) < ln:
        payload += s.recv(ln - len(payload))
    if op == 8:
        return "__CLOSE__"
    if op in (9, 10):
        return "__PING__"
    return payload.decode(errors="replace")


def post(path, token=None, body=None):
    data = json.dumps(body or {}).encode()
    req = urllib.request.Request(f"http://{API}{path}", data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def main():
    staff_token = open("/tmp/qlio_tok").read().strip()
    receipt = open("/tmp/qlio_rt").read().strip()

    sock, status = ws_connect(f"/api/public/receipt/{receipt}/ws")
    print(f"  handshake: {status}")

    frames = []

    def reader():
        try:
            while True:
                f = read_frame(sock)
                if f is None or f == "__CLOSE__":
                    break
                if f != "__PING__":
                    frames.append(f)
        except Exception:
            pass

    threading.Thread(target=reader, daemon=True).start()
    time.sleep(0.6)  # let the hub register the subscriber

    code, resp = post("/api/staff/queue/call-next", staff_token, {})
    print(f"  call-next: HTTP {code} -> {resp}")

    deadline = time.time() + 6
    while time.time() < deadline and not frames:
        time.sleep(0.2)

    print(f"  frames received: {len(frames)}")
    for f in frames:
        print(f"    {f[:300]}")
    sock.close()
    return 0 if frames else 1


if __name__ == "__main__":
    sys.exit(main())
