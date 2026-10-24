package ccxt

// Markets book: the four market/currency tables live in one immutable snapshot.
// One owner goroutine applies every edit; writers hand the edit over a channel and
// wait for the swap, so the read-modify-write is serialized without a lock.

type marketsBook struct {
	markets        map[string]any
	marketsById    map[string]any
	currencies     map[string]any
	currenciesById map[string]any
}

type marketsBookEdit struct {
	apply func(*marketsBook)
	done  chan any
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

// publishMarketsBook is the single write path: hand one edit to the owner goroutine
// and wait for the swap, so a returned write is already visible to the caller.
func (this *BaseExchange) publishMarketsBook(edit func(*marketsBook)) {
	this.marketsBookOnce.Do(func() {
		this.marketsBookEdits = make(chan marketsBookEdit)
		go this.ownMarketsBook(this.marketsBookEdits)
	})
	done := make(chan any)
	this.marketsBookEdits <- marketsBookEdit{apply: edit, done: done}
	if recovered := <-done; recovered != nil {
		panic(recovered)
	}
}

// ownMarketsBook is the book's only writer: edits are applied one at a time, and the
// fresh snapshot is stored before the writer is released.
func (this *BaseExchange) ownMarketsBook(edits <-chan marketsBookEdit) {
	for edit := range edits {
		edit.done <- this.applyMarketsBookEdit(edit.apply)
	}
}

func (this *BaseExchange) applyMarketsBookEdit(edit func(*marketsBook)) (recovered any) {
	defer func() {
		recovered = recover()
	}()
	next := marketsBookNext(this.marketsBook.Load())
	edit(next)
	this.marketsBook.Store(next)
	return
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
