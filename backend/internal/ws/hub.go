package ws

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Event struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload,omitempty"`
	At      time.Time   `json:"at"`
}

type client struct {
	conn *websocket.Conn
	send chan []byte
	room string
}

// Hub fans queue events out to every listener in a business room.
// Rooms: "biz:<id>" for staff/display, "rcpt:<token>" for one customer receipt.
type Hub struct {
	mu    sync.RWMutex
	rooms map[string]map[*client]bool
}

var H = &Hub{rooms: make(map[string]map[*client]bool)}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

func (h *Hub) add(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[c.room] == nil {
		h.rooms[c.room] = make(map[*client]bool)
	}
	h.rooms[c.room][c] = true
}

func (h *Hub) remove(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if set, ok := h.rooms[c.room]; ok {
		if _, exists := set[c]; exists {
			delete(set, c)
			close(c.send)
		}
		if len(set) == 0 {
			delete(h.rooms, c.room)
		}
	}
}

// Broadcast sends an event to every client in a room. Non-blocking.
func (h *Hub) Broadcast(room, evType string, payload interface{}) {
	b, err := json.Marshal(Event{Type: evType, Payload: payload, At: time.Now()})
	if err != nil {
		log.Printf("ws: marshal: %v", err)
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.rooms[room] {
		select {
		case c.send <- b:
		default: // slow consumer — drop rather than block the queue
		}
	}
}

func (h *Hub) Count(room string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.rooms[room])
}

// Serve upgrades the HTTP request and joins the given room.
func Serve(w http.ResponseWriter, r *http.Request, room string) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	c := &client{conn: conn, send: make(chan []byte, 32), room: room}
	H.add(c)

	go func() { // writer
		ticker := time.NewTicker(30 * time.Second)
		defer func() {
			ticker.Stop()
			conn.Close()
		}()
		for {
			select {
			case msg, ok := <-c.send:
				if !ok {
					conn.WriteMessage(websocket.CloseMessage, []byte{})
					return
				}
				conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
				if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
					return
				}
			case <-ticker.C:
				conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					return
				}
			}
		}
	}()

	// reader: we only need it to detect disconnects
	go func() {
		defer H.remove(c)
		conn.SetReadLimit(4096)
		conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		conn.SetPongHandler(func(string) error {
			conn.SetReadDeadline(time.Now().Add(90 * time.Second))
			return nil
		})
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
			conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		}
	}()
}
