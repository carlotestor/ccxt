package ccxt

// The ws caches on BaseExchange (Orderbooks / Ohlcvs / Trades / FundingRates, and the balance map
// boxed in Balance) are plain map[string]any, so exactly one goroutine may touch them: the
// exchange's ws dispatch loop. Client read loops hand every frame to that loop, and user-path code
// (watch/fetch/seed bodies, CleanWsData, loadOrderBook, SetBalanceCache) hands it a map operation
// and waits for the answer. Handler code (Handle*) runs on the loop and indexes the maps directly -
// no lock, no sync.Map at either end.
//
// Ownership argument: the loop is the only goroutine that reads or writes those maps. Frames
// arrive on store.frames, map operations on store.ops, and the loop serves one at a time, so a
// handler and an operation can never overlap. The Balance field itself is written only before the
// loop exists (InitParent) and on the loop, so the box is owner-held too. Not verified with -race
// (no -race gate on the farm).

const (
	wsOpGet = iota
	wsOpHas
	wsOpSet
	wsOpGetScalar
	wsOpSnapshot
	wsOpReset
	wsOpReplace
	wsOpApplySnapshot
)

type wsFrame struct {
	client  any
	message any
}

// wsCacheRead carries the comma-ok answer of a read, so the caller learns both the value and
// whether the key was there.
type wsCacheRead struct {
	value  any
	exists bool
}

type wsCacheOp struct {
	op    int
	field string
	key   any
	value any
	reply chan any
}

type wsCacheStore struct {
	frames chan wsFrame
	ops    chan *wsCacheOp
	stop   chan struct{}
	done   chan struct{}
}

// wsCacheStoreNow returns the exchange's dispatch loop, starting it on first use.
func (this *BaseExchange) wsCacheStoreNow() *wsCacheStore {
	this.wsStoreMu.Lock()
	defer this.wsStoreMu.Unlock()
	if this.wsStore == nil {
		store := &wsCacheStore{
			frames: make(chan wsFrame, 4096),
			ops:    make(chan *wsCacheOp),
			stop:   make(chan struct{}),
			done:   make(chan struct{}),
		}
		this.wsStore = store
		go this.wsCacheLoop(store)
	}
	return this.wsStore
}

// WsDispatch is the ws client's onMessage callback: it hands the frame to the dispatch loop, the
// owner of the ws caches and the only goroutine that runs HandleMessage.
func (this *BaseExchange) WsDispatch(client any, message any) {
	store := this.wsCacheStoreNow()
	select {
	case store.frames <- wsFrame{client: client, message: message}:
	case <-store.stop:
		// the exchange was closed while the read loop was still draining
	}
}

func (this *BaseExchange) wsCacheLoop(store *wsCacheStore) {
	defer close(store.done)
	for {
		select {
		case <-store.stop:
			return
		case frame := <-store.frames:
			this.DerivedExchange.HandleMessage(frame.client, frame.message)
		case req := <-store.ops:
			req.reply <- this.wsCacheApply(req)
		}
	}
}

// wsCacheStop ends the dispatch loop and waits for it, so no second owner can overlap the first.
func (this *BaseExchange) wsCacheStop() {
	this.wsStoreMu.Lock()
	store := this.wsStore
	this.wsStore = nil
	this.wsStoreMu.Unlock()
	if store != nil {
		close(store.stop)
		<-store.done
	}
}

func (this *BaseExchange) wsCacheField(name string) map[string]any {
	switch name {
	case "Orderbooks":
		return this.Orderbooks
	case "Ohlcvs":
		return this.Ohlcvs
	case "Trades":
		return this.Trades
	case "FundingRates":
		return this.FundingRates
	case "Balance":
		return this.wsBalanceMap()
	}
	return nil
}

// wsBalanceMap answers the balance map the owner works on. Balance is boxed in `any` because
// exchanges assign helper results to it; a box that is not a plain map is replaced by one here, so
// every later operation writes the map handler code reads. Runs on the dispatch goroutine, or on the
// caller once the loop is gone (wsCacheDo's fallback), never concurrently with it.
func (this *BaseExchange) wsBalanceMap() map[string]any {
	if asMap, ok := this.Balance.(map[string]any); ok {
		return asMap
	}
	asMap := MapTyped(this.Balance)
	if asMap == nil {
		asMap = map[string]any{}
	}
	this.Balance = asMap
	return asMap
}

// wsCacheApply runs one map operation on the dispatch goroutine. Keys are pointer-carried in
// generated code, so every key is dereferenced first; a non-string key finds nothing.
func (this *BaseExchange) wsCacheApply(req *wsCacheOp) any {
	cache := this.wsCacheField(req.field)
	if cache == nil {
		return nil
	}
	key, keyIsString := derefScalar(req.key).(string)
	switch req.op {
	case wsOpGet:
		if keyIsString {
			return wsCacheRead{value: cache[key], exists: true}
		}
		return wsCacheRead{}
	case wsOpHas:
		if keyIsString {
			_, exists := cache[key]
			return exists
		}
		return false
	case wsOpSet:
		if keyIsString {
			cache[key] = req.value
		}
		return nil
	case wsOpGetScalar:
		// GetValue answered derefScalar's value, so a boxed pointer reads back unboxed
		if keyIsString {
			return wsCacheRead{value: derefScalar(cache[key]), exists: true}
		}
		return wsCacheRead{}
	case wsOpReplace:
		// the whole map is replaced: keep the map handler code and earlier snapshots point at, so
		// only the entries move. An unprovable source (non-map, nil) empties the cache like the
		// assignment of an empty map would.
		source := MapTyped(req.value)
		for k := range cache {
			delete(cache, k)
		}
		for k, v := range source {
			cache[k] = v
		}
		return nil
	case wsOpSnapshot:
		out := make(map[string]any, len(cache))
		for k, v := range cache {
			out[k] = v
		}
		return out
	case wsOpReset:
		for k := range cache {
			delete(cache, k)
		}
		return nil
	case wsOpApplySnapshot:
		// loadOrderBook applies a REST snapshot to the cached book: reading the book's cache,
		// resetting it and feeding it deltas must happen on the owner like every handler does
		book, bookIsMap := req.value.(map[string]any)
		orderBook, orderBookIsInterface := req.key.(OrderBookInterface)
		if !bookIsMap || !orderBookIsInterface {
			return false
		}
		deltas, deltasAreList := (*orderBook.GetCache()).([]any)
		if !deltasAreList {
			return false
		}
		index := ToFloat64(this.DerivedExchange.GetCacheIndex(book, deltas))
		if index < 0 {
			return false
		}
		orderBook.Reset(book)
		this.DerivedExchange.HandleBookDeltas(req.key, deltas[int(index):])
		orderBook.SetCache(map[string]any{})
		return true
	}
	return nil
}

// wsCacheDo hands one operation to the dispatch goroutine and waits for its answer. Only
// user-path code may call this: a handler already runs on the dispatch goroutine and would wait
// on itself, so handlers keep indexing the maps directly.
func (this *BaseExchange) wsCacheDo(op int, field string, key any, value any) any {
	store := this.wsCacheStoreNow()
	req := &wsCacheOp{op: op, field: field, key: key, value: value, reply: make(chan any, 1)}
	select {
	case store.ops <- req:
		return <-req.reply
	case <-store.stop:
		// the loop is gone, so the caller runs the operation itself
		return this.wsCacheApply(req)
	}
}

func (this *BaseExchange) WsCacheGet(field string, key any) any {
	read, _ := this.wsCacheDo(wsOpGet, field, key, nil).(wsCacheRead)
	return read.value
}

// WsCacheGetOk is WsCacheGet with the map's comma-ok: loadOrderBook must tell an absent book from
// a stored one, exactly as `stored, exists := this.Orderbooks[key]` did.
func (this *BaseExchange) WsCacheGetOk(field string, key any) (any, bool) {
	read, _ := this.wsCacheDo(wsOpGet, field, key, nil).(wsCacheRead)
	return read.value, read.exists
}

func (this *BaseExchange) WsCacheHas(field string, key any) bool {
	exists, _ := this.wsCacheDo(wsOpHas, field, key, nil).(bool)
	return exists
}

func (this *BaseExchange) WsCacheSet(field string, key any, value any) {
	this.wsCacheDo(wsOpSet, field, key, value)
}

// WsCacheSnapshot copies the cache on the dispatch goroutine, for callers that walk the whole map
// (FilterByArray, ...) instead of reading one key.
func (this *BaseExchange) WsCacheSnapshot(field string) map[string]any {
	snapshot, _ := this.wsCacheDo(wsOpSnapshot, field, nil, nil).(map[string]any)
	return snapshot
}

func (this *BaseExchange) WsCacheReset(field string) {
	this.wsCacheDo(wsOpReset, field, nil, nil)
}

// WsCacheSetScalar is WsCacheSet with the helper's own derefScalar on the value, so a boxed pointer
// stores the way AddElementToObject stored it.
func (this *BaseExchange) WsCacheSetScalar(field string, key any, value any) {
	this.wsCacheDo(wsOpSet, field, key, derefScalar(value))
}

// WsCacheGetScalar is WsCacheGet with the helper's derefScalar on the answer: GetValue and SafeValue
// unbox a stored pointer, so the plain read would not match them.
func (this *BaseExchange) WsCacheGetScalar(field string, key any) any {
	read, _ := this.wsCacheDo(wsOpGetScalar, field, key, nil).(wsCacheRead)
	return read.value
}

// WsCacheReplace moves the entries of a freshly built map into the cache on the owner, which is what
// a whole-map assignment (this.Balance = this.Extend(...)) means for a map nobody else may write.
func (this *BaseExchange) WsCacheReplace(field string, value any) {
	this.wsCacheDo(wsOpReplace, field, nil, value)
}

// WsCacheApplyOrderBookSnapshot applies a fetched snapshot to the cached book on the owner and
// reports whether the book was behind the cache.
func (this *BaseExchange) WsCacheApplyOrderBookSnapshot(stored any, orderBook any) bool {
	applied, _ := this.wsCacheDo(wsOpApplySnapshot, "Orderbooks", stored, orderBook).(bool)
	return applied
}
