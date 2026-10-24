
namespace ccxt.pro;

using System.Collections.Concurrent;
using Newtonsoft.Json;


using dict = IDictionary<string, object>;

public interface IOrderBook : IDictionary<string, object>
{
    IOrderBook limit();
    void reset(object snapshot = null);
    IOrderBook Copy();
    public IOrderBook update(object snapshot);
    IAsks asks { get; set; }
    IBids bids { get; set; }

    String symbol { get; set; }

    long? nonce { get; set; }
    long? timestamp { get; set; }
    public IList<object> cache { get; set; }
}

public class OrderBook : Dictionary<string, object>, IDictionary<string, object>, IOrderBook
{
    // One store: this dictionary. asks / bids / symbol / nonce / timestamp
    // are typed views of the same slots, so book.asks and book["asks"] cannot
    // drift. Extra keys (datetime, outcome, …) live only in the indexer.

    private IList<object> _cache = new SlimConcurrentList<object>();

    // Owned by the ws receive loop: the frozen asks+bids pair as of the last message
    // step. Readers off the loop copy from here and never touch the live sides.
    internal sealed class BookRows
    {
        public static readonly BookRows Empty = new BookRows(Array.Empty<object>(), Array.Empty<decimal>(), Array.Empty<object>(), Array.Empty<decimal>(), 0, null, null, null, null, false, null, null, null);

        public readonly object[] asks;
        public readonly decimal[] askPrices;
        public readonly object[] bids;
        public readonly decimal[] bidPrices;
        // the book's scalar slots at the same step, so a copy never reads the live dict
        public readonly int depth;
        public readonly object nonce;
        public readonly object timestamp;
        public readonly object datetime;
        public readonly object symbol;
        public readonly bool hasOutcome;
        public readonly object outcome;
        public readonly object outcomeId;
        public readonly object market;

        public BookRows(object[] asks, decimal[] askPrices, object[] bids, decimal[] bidPrices, int depth, object nonce, object timestamp, object datetime, object symbol, bool hasOutcome, object outcome, object outcomeId, object market)
        {
            this.asks = asks;
            this.askPrices = askPrices;
            this.bids = bids;
            this.bidPrices = bidPrices;
            this.depth = depth;
            this.nonce = nonce;
            this.timestamp = timestamp;
            this.datetime = datetime;
            this.symbol = symbol;
            this.hasOutcome = hasOutcome;
            this.outcome = outcome;
            this.outcomeId = outcomeId;
            this.market = market;
        }
    }

    // Owner-loop hand-off: the receive loop freezes the asks+bids pair after every
    // message step and posts it here. Readers take the pair and put it straight back,
    // so nothing off the loop ever reads a member of the live book.
    private readonly BlockingCollection<BookRows> _published = new BlockingCollection<BookRows>(1);

    // The thread that last mutated the book: the client's receive loop in production.
    // limit() trims in place only on that thread; anyone else gets a trimmed snapshot.
    protected int _ownerThread;

    // The pair a caller copies from: one hand-off, so the two halves can never come
    // from different book states.
    internal BookRows TakePair()
    {
        BookRows rows;
        // a take is always put straight back, so the only wait here is for another
        // reader's put-back; the constructor seeds the slot before any copy can run
        if (!this._published.TryTake(out rows) && !this._published.TryTake(out rows, 250))
        {
            return BookRows.Empty;
        }
        this._published.TryAdd(rows);
        return rows;
    }

    // Owner-loop publication point, after every mutation: posts the frozen pair.
    // The pair's row arrays are depth-bounded slices; the live sides keep every row,
    // so a delta past the trimmed tail still lands when the next message arrives.
    internal void PublishRows()
    {
        var askSide = this.asks as OrderBookSide;
        var bidSide = this.bids as OrderBookSide;
        if (askSide == null || bidSide == null)
        {
            return;
        }
        this._ownerThread = Thread.CurrentThread.ManagedThreadId;
        // refresh a side's frozen rows only when it changed, so a scalar-only republish
        // costs no row copy; reset clears the sides directly and marks them dirty
        if (askSide._dirty)
        {
            askSide.Publish();
            askSide._dirty = false;
        }
        if (bidSide._dirty)
        {
            bidSide.Publish();
            bidSide._dirty = false;
        }
        object outcome;
        var hasOutcome = this.TryGetValue("outcome", out outcome) && outcome != null;
        var posted = new BookRows(
            SliceRows(askSide.Published, askSide._depth),
            SlicePrices(askSide.PublishedPrices, askSide._depth),
            SliceRows(bidSide.Published, bidSide._depth),
            SlicePrices(bidSide.PublishedPrices, bidSide._depth),
            askSide._depth,
            Exchange.SafeValue(this as dict, "nonce"),
            Exchange.SafeValue(this as dict, "timestamp"),
            Exchange.SafeValue(this as dict, "datetime"),
            Exchange.SafeValue(this as dict, "symbol"),
            hasOutcome,
            outcome,
            hasOutcome ? Exchange.SafeValue(this as dict, "outcomeId") : null,
            hasOutcome ? Exchange.SafeValue(this as dict, "market") : null);
        // post the newest pair into the one slot; a reader's put-back can fill it
        // between the drop and the post, so retry a bounded number of times
        BookRows stale;
        var attempts = 0;
        while (!this._published.TryAdd(posted) && attempts++ < 8)
        {
            this._published.TryTake(out stale);
        }
    }

    // Depth-bounded view for readers. The live lists keep every row, because a delta
    // past the trimmed tail must still find its row; only the published pair is capped.
    // A full-length or unbounded side hands its own array over: Publish() assigns a
    // fresh array on every mutation and never mutates a published one afterwards.
    private static object[] SliceRows(object[] rows, int depth)
    {
        if (rows == null)
        {
            return null;
        }
        if (depth <= 0 || rows.Length <= depth)
        {
            return rows;
        }
        var cut = new object[depth];
        Array.Copy(rows, cut, depth);
        return cut;
    }

    private static decimal[] SlicePrices(decimal[] prices, int depth)
    {
        if (prices == null)
        {
            return null;
        }
        if (depth <= 0 || prices.Length <= depth)
        {
            return prices;
        }
        var cut = new decimal[depth];
        Array.Copy(prices, cut, depth);
        return cut;
    }

    // the ported API treats Add as an upsert, so a duplicate key must not throw
    public new void Add(string key, object value)
    {
        this[key] = value;
    }

    // Generated handlers write the scalar slots (nonce/timestamp/datetime/symbol) through
    // the interface after the last delta; republish so a copy sees them. Owner-side only.
    object IDictionary<string, object>.this[string key]
    {
        get { return base[key]; }
        set { this.SetSlot(key, value); }
    }

    // Owner-side slot write: keep the published pair's scalars in step with the store.
    private void SetSlot(string key, object value)
    {
        base[key] = value;
        if (this._ownerThread == 0 || this._ownerThread == Thread.CurrentThread.ManagedThreadId)
        {
            this.PublishRows();
        }
    }

    public IList<object> cache
    {
        get
        {
            return _cache;
        }
        set
        {
            _cache = value;
        }
    }

    public IAsks asks
    {
        get
        {
            object value;
            if (!this.TryGetValue("asks", out value))
            {
                return null;
            }
            return value as IAsks;
        }
        set
        {
            this["asks"] = value;
            if (value is OrderBookSide askOwner)
            {
                askOwner.owner = this;
            }
        }
    }

    public IBids bids
    {
        get
        {
            object value;
            if (!this.TryGetValue("bids", out value))
            {
                return null;
            }
            return value as IBids;
        }
        set
        {
            this["bids"] = value;
            if (value is OrderBookSide bidOwner)
            {
                bidOwner.owner = this;
            }
        }
    }

    public String symbol
    {
        get
        {
            object value;
            if (!this.TryGetValue("symbol", out value) || value == null)
            {
                return null;
            }
            return value.ToString();
        }
        set
        {
            this.SetSlot("symbol", value);
        }
    }

    public long? nonce
    {
        get
        {
            object value;
            if (!this.TryGetValue("nonce", out value) || value == null)
            {
                return null;
            }
            return Convert.ToInt64(value);
        }
        set
        {
            this.SetSlot("nonce", value);
        }
    }

    public long? timestamp
    {
        get
        {
            object value;
            if (!this.TryGetValue("timestamp", out value) || value == null)
            {
                return null;
            }
            return Convert.ToInt64(value);
        }
        set
        {
            this.SetSlot("timestamp", value);
        }
    }

    public OrderBook(object snapshot = null, object depth2 = null)
    {
        var depth = (depth2 == null) ? Int32.MaxValue : Convert.ToInt32(depth2);

        var snapshotCopy = new Dictionary<string, object> { };
        if (snapshot != null)
        {
            snapshotCopy = new Dictionary<string, object>(snapshot as dict);
        }
        var rawAsks = Exchange.SafeValue(snapshotCopy, "asks", new SlimConcurrentList<object>());
        var rawBids = Exchange.SafeValue(snapshotCopy, "bids", new SlimConcurrentList<object>());
        var rawTimestamp = Exchange.SafeValue(snapshotCopy, "timestamp");
        var rawNonce = Exchange.SafeValue(snapshotCopy, "nonce");
        var rawSymbol = Exchange.SafeValue(snapshotCopy, "symbol");

        this.asks = (rawAsks is IAsks existingAsks) ? existingAsks : new Asks(rawAsks, depth);
        this.bids = (rawBids is IBids existingBids) ? existingBids : new Bids(rawBids, depth);
        this.timestamp = (rawTimestamp == null) ? null : Convert.ToInt64(rawTimestamp);
        this["datetime"] = Exchange.Iso8601(rawTimestamp);
        this.nonce = (rawNonce == null) ? null : Convert.ToInt64(rawNonce);
        this.symbol = (rawSymbol == null) ? null : rawSymbol.ToString();
        this.PublishRows();
    }

    public IOrderBook limit()
    {
        // Ported delivery contract: limit() bounds the book to depth. Only the thread
        // that mutates the book may trim the live sides; a caller that is not on that
        // loop gets a trimmed snapshot of the published pair instead.
        if (this._ownerThread != 0 && this._ownerThread != Thread.CurrentThread.ManagedThreadId)
        {
            return this.Copy().limit();
        }
        (this.asks as OrderBookSide)?.TrimToDepth();
        (this.bids as OrderBookSide)?.TrimToDepth();
        this.PublishRows();
        return this;
    }




    public IOrderBook update(object snapshot)
    {
        var snapshotNonce = Exchange.SafeValue(snapshot as dict, "nonce");
        if (snapshotNonce != null && this.nonce != null && (long)snapshotNonce <= this.nonce)
        {
            return this;
        }

        this["nonce"] = snapshotNonce;
        this["timestamp"] = Exchange.SafeValue(snapshot as dict, "timestamp", this["timestamp"]);
        this["datetime"] = Exchange.SafeValue(snapshot as dict, "datetime", this["datetime"]);
        this["symbol"] = Exchange.SafeString(snapshot as dict, "symbol", this.symbol);
        this.reset(snapshot);
        return null;
    }

    private void ResetCore(object snapshot = null)
    {
        var askSide = this.asks as OrderBookSide;
        askSide._index.Clear();
        askSide.Clear();
        askSide._dirty = true;

        var snapshotAsks = Exchange.SafeValue(snapshot as dict, "asks") as List<object>;
        if (snapshotAsks != null)
        {
            for (var i = 0; i < snapshotAsks.Count; i++)
            {
                this.asks.storeArray(snapshotAsks[i] as List<object>);
            }
        }

        var bidSide = this.bids as OrderBookSide;
        bidSide._index.Clear();
        bidSide.Clear();
        bidSide._dirty = true;
        var snapshotBids = Exchange.SafeValue(snapshot as dict, "bids") as List<object>;
        if (snapshotBids != null)
        {
            for (var i = 0; i < snapshotBids.Count; i++)
            {
                this.bids.storeArray(snapshotBids[i] as List<object>);
            }
        }
        this["nonce"] = Exchange.SafeValue(snapshot as dict, "nonce", this["nonce"]);
        this["timestamp"] = Exchange.SafeValue(snapshot as dict, "timestamp", this["timestamp"]);
        this["datetime"] = Exchange.Iso8601(this["timestamp"]);
        this["symbol"] = Exchange.SafeValue(snapshot as dict, "symbol", this["symbol"]);
        // prediction-market identity — only attach when present, so crypto books are unchanged
        if ((snapshot as dict) != null && (snapshot as dict).ContainsKey("outcome"))
        {
            this["outcome"] = Exchange.SafeValue(snapshot as dict, "outcome");
            this["outcomeId"] = Exchange.SafeValue(snapshot as dict, "outcomeId");
            this["market"] = Exchange.SafeValue(snapshot as dict, "market");
        }
        // depth is trimmed by limit(), as the port does: reset only replays the
        // snapshot, so a delta that lands past the tail before the next limit() call
        // still finds the row it is meant to update
    }

    public void reset(object snapshot = null)
    {
        this.ResetCore(snapshot);
        this.PublishRows();
    }

    public IOrderBook Copy()
    {
        // Built from the owner's last hand-off, never from the live book: this runs on
        // a caller thread while the receive loop keeps mutating the sides and slots.
        var rows = this.TakePair();
        var copy = new OrderBook(new Dictionary<string, object>());
        var askSide = new Asks(new List<object>(), rows.depth);
        askSide.LoadFromSnapshot(rows.asks, rows.askPrices);
        var bidSide = new Bids(new List<object>(), rows.depth);
        bidSide.LoadFromSnapshot(rows.bids, rows.bidPrices);
        copy.asks = askSide;
        copy.bids = bidSide;
        copy["nonce"] = rows.nonce;
        copy["timestamp"] = rows.timestamp;
        copy["datetime"] = rows.datetime;
        copy["symbol"] = rows.symbol;
        if (rows.hasOutcome)
        {
            copy["outcome"] = rows.outcome;
            copy["outcomeId"] = rows.outcomeId;
            copy["market"] = rows.market;
        }
        copy.PublishRows();
        return copy;
    }


    // Serialize the object safely
    public string Serialize()
    {
        // Serialize the publication, not the live book: same snapshot the callers copy.
        return JsonConvert.SerializeObject(this.Copy());
    }

}

public class CountedOrderBook : OrderBook
{
    public new CountedAsks asks
    {
        get { return base.asks as CountedAsks; }
        set { base.asks = value; }
    }
    public new CountedBids bids
    {
        get { return base.bids as CountedBids; }
        set { base.bids = value; }
    }

    public CountedOrderBook(object snapshot = null, object depth2 = null) : base(Exchange.Extend(snapshot ?? new Dictionary<string, object>(), new Dictionary<string, object> {
       {"asks", new CountedAsks(Exchange.SafeValue(snapshot ?? new Dictionary<string,object>(), "asks", new SlimConcurrentList<object>()), depth2)},
       {"bids", new CountedBids(Exchange.SafeValue(snapshot ?? new Dictionary<string,object>(), "bids", new SlimConcurrentList<object>()), depth2)}
    }), depth2)
    {
    }

    public IOrderBook limit()
    {
        // Ported delivery contract: limit() bounds the book to depth. Only the thread
        // that mutates the book may trim the live sides; a caller that is not on that
        // loop gets a trimmed snapshot of the published pair instead.
        if (this._ownerThread != 0 && this._ownerThread != Thread.CurrentThread.ManagedThreadId)
        {
            return this.Copy().limit();
        }
        (this.asks as OrderBookSide)?.TrimToDepth();
        (this.bids as OrderBookSide)?.TrimToDepth();
        this.PublishRows();
        return this;
    }




    public IOrderBook Copy()
    {
        // Built from the owner's last hand-off, never from the live book: this runs on
        // a caller thread while the receive loop keeps mutating the sides and slots.
        var rows = this.TakePair();
        var copy = new CountedOrderBook(new Dictionary<string, object>());
        var askSide = new CountedAsks(new List<object>(), rows.depth);
        askSide.LoadFromSnapshot(rows.asks, rows.askPrices);
        var bidSide = new CountedBids(new List<object>(), rows.depth);
        bidSide.LoadFromSnapshot(rows.bids, rows.bidPrices);
        copy.asks = askSide;
        copy.bids = bidSide;
        copy["nonce"] = rows.nonce;
        copy["timestamp"] = rows.timestamp;
        copy["datetime"] = rows.datetime;
        copy["symbol"] = rows.symbol;
        if (rows.hasOutcome)
        {
            copy["outcome"] = rows.outcome;
            copy["outcomeId"] = rows.outcomeId;
            copy["market"] = rows.market;
        }
        copy.PublishRows();
        return copy;
    }

}


public class IndexedOrderBook : OrderBook
{
    public new IndexedAsks asks
    {
        get { return base.asks as IndexedAsks; }
        set { base.asks = value; }
    }
    public new IndexedBids bids
    {
        get { return base.bids as IndexedBids; }
        set { base.bids = value; }
    }
    public IndexedOrderBook(object snapshot = null, object depth2 = null) : base(Exchange.Extend(snapshot ?? new Dictionary<string, object>(), new Dictionary<string, object> {
       {"asks", new IndexedAsks(Exchange.SafeValue(snapshot ?? new Dictionary<string,object>(), "asks", new SlimConcurrentList<object>()), depth2)},
       {"bids", new IndexedBids(Exchange.SafeValue(snapshot ?? new Dictionary<string,object>(), "bids", new SlimConcurrentList<object>()), depth2)}
    }), depth2)
    {
    }

    public IOrderBook limit()
    {
        // Ported delivery contract: limit() bounds the book to depth. Only the thread
        // that mutates the book may trim the live sides; a caller that is not on that
        // loop gets a trimmed snapshot of the published pair instead.
        if (this._ownerThread != 0 && this._ownerThread != Thread.CurrentThread.ManagedThreadId)
        {
            return this.Copy().limit();
        }
        (this.asks as OrderBookSide)?.TrimToDepth();
        (this.bids as OrderBookSide)?.TrimToDepth();
        this.PublishRows();
        return this;
    }




    public IOrderBook Copy()
    {
        // Built from the owner's last hand-off, never from the live book: this runs on
        // a caller thread while the receive loop keeps mutating the sides and slots.
        var rows = this.TakePair();
        var copy = new IndexedOrderBook(new Dictionary<string, object>());
        var askSide = new IndexedAsks(new List<object>(), rows.depth);
        askSide.LoadFromSnapshot(rows.asks, rows.askPrices);
        var bidSide = new IndexedBids(new List<object>(), rows.depth);
        bidSide.LoadFromSnapshot(rows.bids, rows.bidPrices);
        copy.asks = askSide;
        copy.bids = bidSide;
        copy["nonce"] = rows.nonce;
        copy["timestamp"] = rows.timestamp;
        copy["datetime"] = rows.datetime;
        copy["symbol"] = rows.symbol;
        if (rows.hasOutcome)
        {
            copy["outcome"] = rows.outcome;
            copy["outcomeId"] = rows.outcomeId;
            copy["market"] = rows.market;
        }
        copy.PublishRows();
        return copy;
    }

}
