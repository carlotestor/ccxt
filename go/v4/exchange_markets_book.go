package ccxt

// Markets book: the four market/currency tables live in one immutable snapshot.
// The load path is the only writer: it builds a complete book off to the side and
// swaps it in with a single atomic store, so readers always see whole tables.

type marketsBook struct {
	markets        map[string]any
	marketsById    map[string]any
	currencies     map[string]any
	currenciesById map[string]any
}

func marketsBookNext(current *marketsBook) *marketsBook {
	next := &marketsBook{}
	if current != nil {
		*next = *current
	}
	return next
}

func marketsBookCopied(source map[string]any) map[string]any {
	if source == nil {
		return nil
	}
	copied := make(map[string]any, len(source)+1)
	for key, value := range source {
		copied[key] = value
	}
	return copied
}

func marketsBookWithEntry(source map[string]any, key any, value any) map[string]any {
	text, ok := derefScalar(key).(string)
	if !ok {
		return source // AddElementToObject writes string keys only
	}
	copied := marketsBookCopied(source)
	if copied == nil {
		copied = map[string]any{}
	}
	copied[text] = derefScalar(value)
	return copied
}

func marketsBookWithoutEntry(source map[string]any, key any) map[string]any {
	text, ok := derefScalar(key).(string)
	if !ok || source == nil {
		return source
	}
	copied := marketsBookCopied(source)
	delete(copied, text)
	return copied
}

// publishMarketsBook is the single write path: copy the current book, apply one
// edit, store the result. The write mutex makes concurrent writers serialize
// their read-modify-write, so no update is lost between them.
func (this *BaseExchange) publishMarketsBook(edit func(*marketsBook)) {
	this.marketsWriteMu.Lock()
	defer this.marketsWriteMu.Unlock()
	next := marketsBookNext(this.marketsBook.Load())
	edit(next)
	this.marketsBook.Store(next)
}

func (this *BaseExchange) Markets() map[string]any {
	book := this.marketsBook.Load()
	if book == nil {
		return nil
	}
	return book.markets
}

func (this *BaseExchange) Markets_by_id() map[string]any {
	book := this.marketsBook.Load()
	if book == nil {
		return nil
	}
	return book.marketsById
}

func (this *BaseExchange) Currencies() map[string]any {
	book := this.marketsBook.Load()
	if book == nil {
		return nil
	}
	return book.currencies
}

func (this *BaseExchange) Currencies_by_id() map[string]any {
	book := this.marketsBook.Load()
	if book == nil {
		return nil
	}
	return book.currenciesById
}

func (this *BaseExchange) PublishMarkets(markets any) {
	this.publishMarketsBook(func(next *marketsBook) {
		next.markets = MapTyped(markets)
	})
}

func (this *BaseExchange) PublishMarketsById(marketsById any) {
	this.publishMarketsBook(func(next *marketsBook) {
		next.marketsById = MapTyped(marketsById)
	})
}

func (this *BaseExchange) PublishCurrencies(currencies any) {
	this.publishMarketsBook(func(next *marketsBook) {
		next.currencies = MapTyped(currencies)
	})
}

func (this *BaseExchange) PublishCurrenciesById(currenciesById any) {
	this.publishMarketsBook(func(next *marketsBook) {
		next.currenciesById = MapTyped(currenciesById)
	})
}

func (this *BaseExchange) AddMarketsEntry(key any, value any) {
	this.publishMarketsBook(func(next *marketsBook) {
		next.markets = marketsBookWithEntry(next.markets, key, value)
	})
}

func (this *BaseExchange) AddMarketsByIdEntry(key any, value any) {
	this.publishMarketsBook(func(next *marketsBook) {
		next.marketsById = marketsBookWithEntry(next.marketsById, key, value)
	})
}

func (this *BaseExchange) RemoveMarketsEntry(key any) {
	this.publishMarketsBook(func(next *marketsBook) {
		next.markets = marketsBookWithoutEntry(next.markets, key)
	})
}

func (this *BaseExchange) RemoveMarketsByIdEntry(key any) {
	this.publishMarketsBook(func(next *marketsBook) {
		next.marketsById = marketsBookWithoutEntry(next.marketsById, key)
	})
}
