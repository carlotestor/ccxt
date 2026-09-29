package ccxt

import "reflect"

// Boundaries of the struct-typed row builders (build/go-struct-returns.ts): the generated
// ParseTicker/SafeTicker return a Ticker, every untyped caller boxes it back with TickerToMap.

// TickerFromMap builds a Ticker from a unified ticker map; keys the struct does not declare
// (and a non-dict `info`) are kept aside so TickerToMap gives back the same map.
func TickerFromMap(data any) Ticker {
	m, ok := data.(map[string]any)
	if !ok {
		return Ticker{}
	}
	t := NewTicker(m)
	// undeclared keys ride in extra, so Info stays the raw info (NewTicker merges them in)
	t.Info = GetInfo(m)
	t.extra = structExtraKeys(m, tickerKeys)
	return t
}

var tickerKeys = map[string]bool{
	"symbol": true, "timestamp": true, "datetime": true, "high": true, "low": true, "bid": true,
	"bidVolume": true, "ask": true, "askVolume": true, "vwap": true, "open": true, "close": true,
	"last": true, "previousClose": true, "change": true, "percentage": true, "average": true,
	"baseVolume": true, "quoteVolume": true, "indexPrice": true, "markPrice": true,
}

// TickerToMap is the inverse of TickerFromMap (the shape every untyped caller expects).
func TickerToMap(t Ticker) map[string]any {
	return StructToMap(t)
}

func (t Ticker) structExtra() map[string]any { return t.extra }

type structExtraCarrier interface{ structExtra() map[string]any }

func structExtraKeys(m map[string]any, known map[string]bool) map[string]any {
	var extra map[string]any
	for k, v := range m {
		if known[k] {
			continue
		}
		if k == "info" {
			if _, isDict := v.(map[string]any); isDict || v == nil {
				continue
			}
		}
		if extra == nil {
			extra = map[string]any{}
		}
		extra[k] = v
	}
	return extra
}

// StructToMap turns a unified struct into its ccxt map: exported fields under their
// lowerCamel key (pointers dereferenced, nil kept as nil), plus the unexported `extra` keys.
// Generic (reflect) so the tests can normalise any struct before a map comparison.
func StructToMap(s any) map[string]any {
	v := reflect.ValueOf(s)
	if v.Kind() == reflect.Ptr {
		if v.IsNil() {
			return nil
		}
		v = v.Elem()
	}
	if v.Kind() != reflect.Struct {
		if m, ok := s.(map[string]any); ok {
			return m
		}
		return nil
	}
	t := v.Type()
	m := make(map[string]any, t.NumField())
	for i := 0; i < t.NumField(); i++ {
		f := t.Field(i)
		if !f.IsExported() {
			continue
		}
		fv := v.Field(i)
		key := lowerFirst(f.Name)
		switch {
		case fv.Kind() == reflect.Ptr && fv.IsNil():
			m[key] = nil
		case fv.Kind() == reflect.Ptr:
			m[key] = fv.Elem().Interface()
		case fv.Kind() == reflect.Map && fv.IsNil():
			m[key] = nil
		default:
			m[key] = fv.Interface()
		}
	}
	if c, ok := v.Interface().(structExtraCarrier); ok {
		for k, x := range c.structExtra() {
			m[k] = x
		}
	}
	return m
}

func lowerFirst(s string) string {
	if s == "" {
		return s
	}
	b := []byte(s)
	if b[0] >= 'A' && b[0] <= 'Z' {
		b[0] += 'a' - 'A'
	}
	return string(b)
}

// TradeFromMap builds a Trade from a unified trade map; `fee`/`fees` and other undeclared keys
// ride in extra so TradeToMap gives back the same map (Fee drops non-dict and unknown fee keys).
func TradeFromMap(data any) Trade {
	m, ok := data.(map[string]any)
	if !ok {
		return Trade{}
	}
	t := NewTrade(m)
	t.Info = GetInfo(m)
	t.extra = structExtraKeys(m, tradeKeys)
	return t
}

var tradeKeys = map[string]bool{
	"amount": true, "price": true, "cost": true, "id": true, "order": true, "timestamp": true,
	"datetime": true, "symbol": true, "type": true, "side": true, "takerOrMaker": true,
}

// TradeToMap is the inverse of TradeFromMap.
func TradeToMap(t Trade) map[string]any {
	m := StructToMap(t)
	// Fee is a value field; the map's own fee (or its absence) lives in extra
	if _, ok := t.extra["fee"]; !ok {
		delete(m, "fee")
	}
	return m
}

func (t Trade) structExtra() map[string]any { return t.extra }
