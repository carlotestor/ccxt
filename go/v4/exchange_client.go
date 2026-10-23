package ccxt

// WebSocket transport for streaming (pro) exchanges.
// supports
// 	- concurrent subscriptions,
// 	- automatic JSON encoding/decoding
// 	- graceful shutdown.
// Higher-level exchange code decides which messages belong to which subscription;
// the client only multiplexes frames to a per-channel inbox.
//

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type ClientInterface interface {
	Resolve(data any, subHash any) any
	Future(messageHash any) <-chan AsyncResult[any]
	ReusableFuture(messageHash any) *Future
	Reject(err any, messageHash ...any)
	SendAsync(message any) <-chan AsyncResult[bool]
	Reset(err any)
	OnPong()
	GetError() error
	SetError(err error)
	GetUrl() string
	SubscriptionHas(key any) bool
	SubscriptionGet(key any) any
	SubscriptionDict(key any) map[string]any
	SubscriptionSet(key any, value any)
	SubscriptionDel(key any)
	SubscriptionLoadOrStore(key any, value any) (any, bool)
	SubscriptionKeys() []string
	SubscriptionValues() []any
	SubscriptionsSnapshot() map[string]any
	GetRejections() map[string]any
	GetLastPong() any
	SetLastPong(lastPong any)
	GetKeepAlive() any
	SetKeepAlive(keepAlive any)
	GetFutures() map[string]any
}

// Client is a thin wrapper around a single ws:// or wss:// connection.
// Subscriptions are identified by an arbitrary hash string
// Each Subscribe call returns a receive-only channel that the caller reads updates from.
type Client struct {
	Futures   map[string]any
	FuturesMu sync.RWMutex // protects Futures map and Rejections
	Url       string

	Connection   *websocket.Conn
	ConnectionMu sync.Mutex // protects conn writes

	PongSetMu sync.RWMutex // protects LastPong set

	subscriptions *subscriptionMap // map[string]any, owned by its own goroutine
	subsOnce      sync.Once

	ConnectMu      sync.RWMutex // protects Connect calls
	ReadLoopClosed chan struct{}

	Error error // last error, nil if connection considered healthy

	Connected             any            // *Future             		// signal channel for connection established
	Disconnected          any            // *Future              	// future for disconnection
	Rejections            map[string]any // map for rejection info
	KeepAlive             any            // number in milliseconds or seconds
	ConnectionTimeout     any            // e.g. *time.Timer or context.CancelFunc
	Verbose               bool           // default false
	DecompressBinary      bool
	IsMock                bool                          // static ws tests: transport is stubbed, sends are recorded
	MockSentMessages      []any                         // frames recorded in mock mode
	ConnectionTimer       any                           // e.g. *time.Timer or custom timer
	LastPong              any                           // time or timestamp type recommended
	MaxPingPongMisses     any                           // int or counter type
	PingInterval          any                           // time.Duration recommended
	ConnectionEstablished any                           // signal or state variable
	Gunzip                any                           // gzip decompressor (e.g. io.Reader)
	Inflate               any                           // zlib inflater or similar
	URL                   string                        // URL string
	IsConnected           any                           // bool or state variable
	OnConnectedCallback   func(client any, message any) // callback function signature - adjust as needed
	OnMessageCallback     func(client any, message any) // example callback with message
	OnErrorCallback       func(client any, err any)     // error callback
	OnCloseCallback       func(client any, err any)     // connection closed callback
	Ping                  any                           // e.g. timer or pong/ping state
	Throttle              any                           // throttling mechanism (rate limiter, etc.)
	// Owner any 											// pointer to the exchange that created the client
}

func (this *Client) Resolve(data any, subHash any) any {
	// message hashes are built in generated WS code from Safe* values, so they
	// arrive pointer-carried; normalize before asserting
	hash, ok := derefScalar(subHash).(string)
	if !ok {
		panic(fmt.Sprintf("subHash must be a string, got %T: %v", subHash, subHash))
	}

	// Send to Future channel for ongoing updates (non-blocking)
	this.FuturesMu.Lock()
	if fut, exists := this.Futures[hash]; exists {
		// Print("Inside resolve, existed future for hash: " + hash)
		fut.(*Future).Resolve(data)
		delete(this.Futures, hash)
	}
	this.FuturesMu.Unlock()
	return data
}

func (this *Client) Future(messageHash any) <-chan AsyncResult[any] {
	future := this.NewFuture(messageHash)
	return future.Await()
}

func (this *Client) ReusableFuture(messageHash any) *Future {
	future := this.NewFuture(messageHash)
	return future
}

func (this *Client) NewFuture(messageHash any) *Future {
	hash, _ := derefScalar(messageHash).(string)
	this.FuturesMu.Lock()
	// a retained rejection fails this consumer fast. the spent future stays
	// out of the map so the next consumer is not poisoned by the old error.
	// Rejections shares FuturesMu (the unlocked read and delete here was a
	// concurrent map access race with Reject)
	if err, ok := this.Rejections[hash]; ok {
		delete(this.Rejections, hash)
		this.FuturesMu.Unlock()
		future := NewFuture()
		future.Reject(err.(error))
		return future
	}
	if _, ok := this.Futures[hash]; !ok {
		this.Futures[hash] = NewFuture()
	}
	future := this.Futures[hash]
	this.FuturesMu.Unlock()
	return future.(*Future)
}

// Reject rejects specific future or all
func (this *Client) Reject(err any, messageHash ...any) {
	this.FuturesMu.Lock()
	if len(messageHash) == 0 {
		for hash := range this.Futures {
			this.Futures[hash].(*Future).Reject(err.(error))
			delete(this.Futures, hash)
		}
		this.FuturesMu.Unlock()
		return
	}
	hash := messageHash[0]
	if fut, ok := this.Futures[hash.(string)]; ok {
		fut.(*Future).Reject(err.(error))
		delete(this.Futures, derefScalar(hash).(string))
	} else {
		// ts parity: an error arriving while no consumer future exists is
		// retained so the next NewFuture fails fast instead of the error
		// being dropped
		if this.Rejections == nil {
			this.Rejections = map[string]any{}
		}
		this.Rejections[derefScalar(hash).(string)] = err
	}
	this.FuturesMu.Unlock()
}

// Close terminates the underlying websocket connection (if any)
func (this *Client) Close() error {
	this.ConnectionMu.Lock()
	defer this.ConnectionMu.Unlock()
	if this.Connection != nil {
		err := this.Connection.Close()
		this.Connection = nil
		this.IsConnected = false

		// Signal disconnection
		this.Disconnected.(*Future).Resolve(true)

		return err
	}
	return nil
}

// NewClient creates a new WebSocket client with the given URL and callbacks
// Matches the TypeScript constructor exactly with all the same properties
func NewClient(url string, onMessageCallback func(client any, err any), onErrorCallback func(client any, err any), onCloseCallback func(client any, err any), onConnectedCallback func(client any, err any), config ...map[string]any) *Client {
	// Set up defaults exactly like TypeScript constructor
	defaults := map[string]any{
		"Url":                   url,
		"OnMessageCallback":     onMessageCallback,
		"OnErrorCallback":       onErrorCallback,
		"OnCloseCallback":       onCloseCallback,
		"OnConnectedCallback":   onConnectedCallback,
		"Verbose":               false,
		"Protocols":             nil,
		"Options":               nil,
		"Futures":               make(map[string]any),
		"Rejections":            make(map[string]any),
		"Connected":             nil,
		"Error":                 nil,
		"ConnectionStarted":     nil,
		"ConnectionEstablished": nil,
		"IsConnected":           false,
		"ConnectionTimer":       nil,
		"ConnectionTimeout":     10000,
		"PingInterval":          nil,
		"Ping":                  nil,
		"keepAlive":             30000,
		"MaxPingPongMisses":     2.0,
		"Connection":            nil,
		"StartedConnecting":     false,
		"gunzip":                false,
		"inflate":               false,
		"DecompressBinary":      true,
	}

	// Apply config overrides if provided
	finalConfig := defaults
	if len(config) > 0 {
		for key, value := range config[0] {
			if value != nil {
				finalConfig[key] = value
			}
		}
	}

	// Create the client with all properties from TypeScript constructor
	c := &Client{
		Url:                 url,
		Futures:             finalConfig["Futures"].(map[string]any),
		subscriptions:       newSubscriptionMap(),
		Rejections:          finalConfig["Rejections"].(map[string]any),
		Verbose:             derefScalar(finalConfig["Verbose"]).(bool),
		KeepAlive:           ParseInt(finalConfig["keepAlive"]),
		MaxPingPongMisses:   finalConfig["MaxPingPongMisses"],
		IsConnected:         finalConfig["IsConnected"],
		OnConnectedCallback: onConnectedCallback,
		OnMessageCallback:   onMessageCallback,
		OnErrorCallback:     onErrorCallback,
		OnCloseCallback:     onCloseCallback,
		ConnectionTimeout:   finalConfig["ConnectionTimeout"],
		ConnectionTimer:     finalConfig["ConnectionTimer"],
		PingInterval:        finalConfig["PingInterval"],
		Ping:                finalConfig["Ping"],
		Connection: func() *websocket.Conn {
			if finalConfig["connection"] != nil {
				if conn, ok := finalConfig["Connection"].(*websocket.Conn); ok {
					return conn
				}
			}
			return nil
		}(),
		ConnectionEstablished: finalConfig["ConnectionEstablished"],
		Gunzip:                finalConfig["gunzip"],
		Inflate:               finalConfig["inflate"],
		Throttle:              finalConfig["Throttle"],
		ReadLoopClosed:        make(chan struct{}),
		Connected:             NewFuture(),
		Disconnected:          NewFuture(),
		DecompressBinary:      derefScalar(finalConfig["DecompressBinary"]).(bool),
	}

	return c
}

func (this *Client) OnPong() {
	this.PongSetMu.Lock()
	defer this.PongSetMu.Unlock()
	this.LastPong = time.Now().UnixMilli()
	if this.Verbose {
		log.Println(time.Now(), "onPong")
	}
}

func (this *Client) Reset(err any) {
	// Stop any active timers/intervals
	if t, ok := this.ConnectionTimer.(*time.Timer); ok {
		t.Stop()
	}
	if tk, ok := this.PingInterval.(*time.Ticker); ok {
		tk.Stop()
	}
	// Clear error and close connection
	_ = this.Close()
	// Reject all pending futures with provided error (or generic)
	if err == nil {
		err = "connection reset"
	}
	this.Reject(err)
}

func (this *Client) Log(args ...any) {
	fmt.Println(args...)
	// fmt.Printf("%+v\n", args) // equivalent to console.dir with depth
}

func (this *Client) Connect(backoffDelay ...int) (any, error) {
	return nil, NotSupported(this.Url + " connect() not implemented yet")
}

func (this *Client) IsOpen() (any, error) {
	return nil, NotSupported(this.Url + " isOpen() not implemented yet")
}

func (this *Client) OnConnectionTimeout() {
	if !derefScalar(this.IsConnected).(bool) {
		err := RequestTimeout("Connection to " + this.Url + " failed due to a connection timeout")
		this.OnError(err)
		if this.Connection != nil {
			this.Connection.Close()
		}
		// ? this.Connection.Close(1006)
	}
}

func (this *Client) SetConnectionTimeout() {
	if this.ConnectionTimeout != nil && this.ConnectionTimeout != false {
		if timeout, ok := this.ConnectionTimeout.(int); ok {
			this.ConnectionTimer = time.AfterFunc(time.Duration(timeout)*time.Millisecond, this.OnConnectionTimeout)
		}
	}
}

func (this *Client) ClearConnectionTimeout() {
	if this.ConnectionTimer != nil && this.ConnectionTimer != false {
		if timer, ok := this.ConnectionTimer.(*time.Timer); ok {
			timer.Stop()
		}
		this.ConnectionTimer = nil
	}
}

// this method is not used at this time, because in JS the ws client will
// respond to pings coming from the server with pongs automatically
// however, some devs may want to track connection states in their app
func (this *Client) OnPing() {
	if this.Verbose {
		this.Log(time.Now(), "onPing")
	}
}

func (this *Client) OnPongTS() {
	this.LastPong = time.Now().UnixNano() / int64(time.Millisecond)
	if this.Verbose {
		this.Log(time.Now(), "onPong")
	}
}

func (this *Client) OnError(err any) {
	if this.Verbose {
		this.Log(time.Now(), "onError", err)
	}
	// Convert error to appropriate type if needed
	if errStr, ok := err.(string); ok {
		err = NetworkError(errStr)
	}
	this.Error = err.(error)
	this.Reset(this.Error)
	if this.OnErrorCallback != nil {
		this.OnErrorCallback(this, this.Error)
	}
}

func (this *Client) OnClose(event any) {
	if this.Verbose {
		this.Log(time.Now(), "onClose", event)
	}
	if this.Error == nil {
		// todo: exception types for server-side disconnects
		// this.Reset(NetworkError("connection closed by remote server, closing code " + event.code)) // TODO: what type is event?
		eventStr := fmt.Sprintf("%v", event)
		this.Reset(NetworkError("connection closed by remote server, closing code " + eventStr))
	}
	// if err, ok := this.Error.(ExchangeClosedByUser); ok {  // TODO: how to do this
	// 	this.Reset(err)
	// }
	if this.Disconnected != nil {
		this.Disconnected.(*Future).Resolve(true)
	}
	this.OnCloseCallback(this, event) // TODO: What to do with event? parameter is error
}

// this method is not used at this time
// but may be used to read protocol-level data like cookies, headers, etc
func (this *Client) OnUpgrade(message any) {
	if this.Verbose {
		this.Log(time.Now(), "onUpgrade")
	}
}

func (this *Client) SendAsync(message any) <-chan AsyncResult[bool] {
	var msgStr string
	if str, ok := message.(string); ok {
		msgStr = str
	} else {
		msgBytes, _ := json.Marshal(message)
		msgStr = string(msgBytes)
	}

	if this.Verbose {
		this.Log(time.Now(), "sending", msgStr)
	}

	future := NewFuture()
	ch := make(chan AsyncResult[bool])
	go func() {
		this.ConnectionMu.Lock()
		// ? if (isNode)
		if this.IsMock {
			// static ws tests: record the outgoing frame so the test can assert it
			var parsed any
			if err := json.Unmarshal([]byte(msgStr), &parsed); err == nil {
				this.MockSentMessages = append(this.MockSentMessages, parsed)
			}
			future.Resolve(true)
			ch <- AsyncResult[bool]{Value: true}
		} else if this.Connection == nil {
			err := NetworkError("not connected to " + this.Url)
			future.Reject(err)
			// the caller receives on ch (see Exchange.watch); without sending here
			// it would block forever when the connection is not established
			ch <- AsyncResult[bool]{Err: err}
		} else {
			err := this.Connection.WriteMessage(websocket.TextMessage, []byte(msgStr))
			if err != nil {
				future.Reject(err)
				ch <- AsyncResult[bool]{Err: err}
			} else {
				future.Resolve(true)
				ch <- AsyncResult[bool]{Value: true}
			}
		}

		this.ConnectionMu.Unlock()
	}()

	return ch
}

func (this *Client) CloseConnection() (any, error) {
	return nil, NotSupported(this.Url + " close() not implemented yet")
}

func gunzipData(data []byte) ([]byte, error) {
	r, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	defer r.Close()

	var out bytes.Buffer
	if _, err := io.Copy(&out, r); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

func IsJSON(b []byte) bool {
	var js any
	return json.Unmarshal(b, &js) == nil
}

func (this *Client) OnMessage(messageEvent any) {
	// if we use onmessage we get MessageEvent objects
	// MessageEvent {isTrusted: true, data: "{"e":"depthUpdate","E":1581358737706,"s":"ETHBTC",…"0.06200000"]],"a":[["0.02261300","0.00000000"]]}", origin: "wss://stream.binance.com:9443", lastEventId: "", source: null, …}

	var message any
	if eventMap, ok := messageEvent.(map[string]any); ok {
		if data, exists := eventMap["data"]; exists {
			message = data
		}
	} else {
		message = messageEvent
	}

	var messageStr string
	var messageIsBinary = false
	var messageBytes []byte
	if str, ok := message.(string); ok {
		messageStr = str
	} else if bytes, ok := message.([]byte); ok {
		// Handle binary data
		if this.Gunzip != nil && derefScalar(this.Gunzip).(bool) {
			// Would need to implement gzip decompression
			gunzipOut, _ := gunzipData(bytes)
			messageStr = string(gunzipOut)
		} else if this.Inflate != nil && derefScalar(this.Inflate).(bool) {
			// Would need to implement zlib inflation
			messageStr = string(bytes)
		} else {
			// some exchanges send a regular json message as a binary frame, so json
			// is still read as text. text frames arrive here as strings, a utf-8 check
			// would turn the binary payloads that happen to be valid utf-8 into text
			if this.DecompressBinary || IsJSON(bytes) {
				messageStr = string(bytes)
			} else {
				messageIsBinary = true
				messageBytes = bytes
			}
		}
	} else {
		messageStr = fmt.Sprintf("%v", message)
	}

	// Try to parse as JSON
	var parsedMessage any
	if this.IsJsonEncodedObject(messageStr) {
		// Replace large numbers with strings to prevent precision loss
		re := regexp.MustCompile(`:(\d{15,}),`)
		messageStr = re.ReplaceAllString(messageStr, `:"$1",`)

		parsedMessage = ParseJSON(messageStr)
		if parsedMessage == nil {
			if this.Verbose {
				this.Log(time.Now(), "onMessage JSON.parse", "failed to parse message")
			}
		}
	}

	if this.Verbose {
		if messageIsBinary && !this.DecompressBinary {
			this.Log(time.Now(), "onMessage [binary]", messageBytes)
		} else if parsedMessage != nil {
			this.Log(time.Now(), "onMessage", parsedMessage)
		} else {
			this.Log(time.Now(), "onMessage", messageStr)
		}
		// unlimited depth
		// this.Log(time.Now(), "onMessage", util.inspect(message, false, null, true))
		// this.Log(time.Now(), "onMessage", JSON.stringify(message, null, 4))
	}
	if messageIsBinary && !this.DecompressBinary {
		this.OnMessageCallback(this, messageBytes)
	} else if parsedMessage != nil {
		this.OnMessageCallback(this, parsedMessage)
	} else {
		this.OnMessageCallback(this, messageStr)

	}
}

func (this *Client) IsJsonEncodedObject(str string) bool {
	str = strings.TrimSpace(str)
	return (strings.HasPrefix(str, "{") && strings.HasSuffix(str, "}")) ||
		(strings.HasPrefix(str, "[") && strings.HasSuffix(str, "]"))
}

func (this *Client) GetError() error {
	return this.Error
}

func (this *Client) SetError(err error) {
	this.Error = err
}

func (this *Client) GetUrl() string {
	return this.Url
}

// subscriptionMap is the client's subscription table: a plain map[string]any that only the
// goroutine below ever touches, so concurrent subscribe/handler/enqueue paths hand off a
// request instead of sharing the map.
type subscriptionMap struct {
	req chan subsOp
}

type subsKind int

const (
	subsHas subsKind = iota
	subsGet
	subsSet
	subsDel
	subsLoadOrStore
	subsKeys
	subsValues
	subsSnapshot
)

type subsOp struct {
	kind  subsKind
	key   string
	value any
	reply chan subsReply
}

type subsReply struct {
	value any
	ok    bool
}

func newSubscriptionMap() *subscriptionMap {
	subs := &subscriptionMap{req: make(chan subsOp)}
	go subs.own()
	return subs
}

// own is the only function that reads or writes the table; it never calls back out.
func (this *subscriptionMap) own() {
	data := map[string]any{}
	for op := range this.req {
		switch op.kind {
		case subsHas:
			_, ok := data[op.key]
			op.reply <- subsReply{ok: ok}
		case subsGet:
			op.reply <- subsReply{value: derefScalar(data[op.key])}
		case subsSet:
			data[op.key] = op.value
			op.reply <- subsReply{}
		case subsDel:
			delete(data, op.key)
			op.reply <- subsReply{}
		case subsLoadOrStore:
			if existing, ok := data[op.key]; ok {
				op.reply <- subsReply{value: existing, ok: true}
			} else {
				data[op.key] = op.value
				op.reply <- subsReply{value: op.value}
			}
		case subsKeys:
			keys := make([]string, 0, len(data))
			for key := range data {
				keys = append(keys, key)
			}
			op.reply <- subsReply{value: keys}
		case subsValues:
			values := make([]any, 0, len(data))
			for _, value := range data {
				values = append(values, value)
			}
			op.reply <- subsReply{value: values}
		case subsSnapshot:
			snapshot := make(map[string]any, len(data))
			for key, value := range data {
				snapshot[key] = value
			}
			op.reply <- subsReply{value: snapshot}
		}
	}
}

func (this *subscriptionMap) call(kind subsKind, key string, value any) subsReply {
	reply := make(chan subsReply)
	this.req <- subsOp{kind: kind, key: key, value: value, reply: reply}
	return <-reply
}

// subsTable lazily creates the table for a Client built as a struct literal.
func (this *Client) subsTable() *subscriptionMap {
	this.subsOnce.Do(func() {
		if this.subscriptions == nil {
			this.subscriptions = newSubscriptionMap()
		}
	})
	return this.subscriptions
}

// subsKey normalizes a subscription key like the table helpers did: pointers are unwrapped
// and anything but a string cannot address the table.
func subsKey(key any) (string, bool) {
	keyStr, ok := derefScalar(key).(string)
	return keyStr, ok
}

// SubscriptionHas reports membership; a nil or non-string key is never a member.
func (this *Client) SubscriptionHas(key any) bool {
	keyStr, ok := subsKey(key)
	if !ok {
		return false
	}
	return this.subsTable().call(subsHas, keyStr, nil).ok
}

// SubscriptionGet reads a subscription, unwrapping a pointer-carried value like GetValue.
func (this *Client) SubscriptionGet(key any) any {
	keyStr, ok := subsKey(key)
	if !ok {
		return nil
	}
	return this.subsTable().call(subsGet, keyStr, nil).value
}

// SubscriptionDict reads a subscription that holds a dictionary, nil otherwise.
func (this *Client) SubscriptionDict(key any) map[string]any {
	if asMap, ok := this.SubscriptionGet(key).(map[string]any); ok {
		return asMap
	}
	return nil
}

// SubscriptionSet stores a subscription; a nil or non-string key stores nothing.
func (this *Client) SubscriptionSet(key any, value any) {
	keyStr, ok := subsKey(key)
	if !ok {
		return
	}
	this.subsTable().call(subsSet, keyStr, value)
}

// SubscriptionDel removes a subscription, panicking on a non-string key like Remove.
func (this *Client) SubscriptionDel(key any) {
	keyStr, ok := derefScalar(key).(string)
	if !ok {
		panic("provided key is not a string")
	}
	this.subsTable().call(subsDel, keyStr, nil)
}

// SubscriptionLoadOrStore registers a subscription, reporting whether it was already there.
func (this *Client) SubscriptionLoadOrStore(key any, value any) (any, bool) {
	keyStr, ok := derefScalar(key).(string)
	if !ok {
		panic("provided key is not a string")
	}
	reply := this.subsTable().call(subsLoadOrStore, keyStr, value)
	return reply.value, reply.ok
}

// SubscriptionKeys lists the subscription hashes.
func (this *Client) SubscriptionKeys() []string {
	keys, _ := this.subsTable().call(subsKeys, "", nil).value.([]string)
	return keys
}

// SubscriptionValues lists the stored subscriptions.
func (this *Client) SubscriptionValues() []any {
	values, _ := this.subsTable().call(subsValues, "", nil).value.([]any)
	return values
}

// SubscriptionsSnapshot copies the table for read-only iteration.
func (this *Client) SubscriptionsSnapshot() map[string]any {
	snapshot, _ := this.subsTable().call(subsSnapshot, "", nil).value.(map[string]any)
	return snapshot
}

func (this *Client) GetRejections() map[string]any {
	return this.Rejections
}

func (this *Client) GetLastPong() any {
	this.PongSetMu.RLock()
	defer this.PongSetMu.RUnlock()
	return this.LastPong
}
func (this *Client) SetLastPong(lastPong any) {
	this.PongSetMu.Lock()
	defer this.PongSetMu.Unlock()
	this.LastPong = lastPong
}
func (this *Client) SetKeepAlive(keepAlive any) {
	this.KeepAlive = keepAlive
}
func (this *Client) GetKeepAlive() any {
	return this.KeepAlive
}
func (this *Client) GetFutures() map[string]any {
	return this.Futures
}

type wsMessageHandler interface {
	HandleMessage(client *Client, msg any)
}
