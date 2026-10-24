
namespace ccxt.pro;

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

public class OrderBook : CustomConcurrentDictionary<string, object>, IOrderBook
{
    // One store: this dictionary. asks / bids / symbol / nonce / timestamp
    // are typed views of the same slots, so book.asks and book["asks"] cannot
    // drift. Extra keys (datetime, outcome, …) live only in the indexer.

    private IList<object> _cache = new SlimConcurrentList<object>();

    // Owned by the ws receive loop: the frozen asks+bids pair as of the last message
    // step. Readers off the loop copy from here and never touch the live sides.
    internal sealed class BookRows
    {
        public readonly object[] asks;
        public readonly decimal[] askPrices;
        public readonly object[] bids;
        public readonly decimal[] bidPrices;

        public BookRows(object[] asks, decimal[] askPrices, object[] bids, decimal[] bidPrices)
        {
            this.asks = asks;
            this.askPrices = askPrices;
            this.bids = bids;
            this.bidPrices = bidPrices;
        }
    }

    private BookRows _publishedRows;

    // The pair a caller copies from: one publication, so the two halves can never
    // come from different book states.
    internal BookRows PublishedRows()
    {
        var rows = this._publishedRows;
        if (rows != null)
        {
            return rows;
        }
        var askSide = this.asks as OrderBookSide;
        var bidSide = this.bids as OrderBookSide;
        if (askSide == null || bidSide == null)
        {
            return new BookRows(Array.Empty<object>(), Array.Empty<decimal>(), Array.Empty<object>(), Array.Empty<decimal>());
        }
        return new BookRows(askSide.LiveArray(), askSide.PublishedPrices, bidSide.LiveArray(), bidSide.PublishedPrices);
    }

    // Owner-loop publication point, called by a side after every mutation: trims both
    // sides to depth, then freezes the pair. Nothing off the loop calls this.
    internal void PublishRows()
    {
        var askSide = this.asks as OrderBookSide;
        var bidSide = this.bids as OrderBookSide;
        if (askSide == null || bidSide == null)
        {
            return;
        }
        askSide.TrimToDepth();
        bidSide.TrimToDepth();
        // refresh both sides' own publications from the live lists, so a reset that
        // cleared them without going through storeArray cannot leave a stale pair
        askSide.Publish();
        bidSide.Publish();
        this._publishedRows = new BookRows(askSide.Published, askSide.PublishedPrices, bidSide.Published, bidSide.PublishedPrices);
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
            this["symbol"] = value;
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
            this["nonce"] = value;
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
            this["timestamp"] = value;
        }
    }

    public OrderBook(object snapshot = null, object depth2 = null)
    {
        var depth = (depth2 == null) ? Int32.MaxValue : Convert.ToInt32(depth2);

        var snapshotCopy = new CustomConcurrentDictionary<string, object> { };
        if (snapshot != null)
        {
            snapshotCopy = new CustomConcurrentDictionary<string, object>(snapshot as dict);
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
        // Trimming is the owner loop's job (PublishRows trims both sides after every
        // mutation), so a caller never mutates the live book here.
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
    }

    public void reset(object snapshot = null)
    {
        this.ResetCore(snapshot);
        this.PublishRows();
    }

    public IOrderBook Copy()
    {
        // Build from the owner's last publication, never from the live sides: this
        // runs on the caller's thread, the sides are mutated on the receive loop.
        var rows = this.PublishedRows();
        var depth = (this.asks is OrderBookSide askDepth) ? askDepth._depth : 0;
        var copy = new OrderBook(new Dictionary<string, object>());
        var askSide = new Asks(new List<object>(), depth);
        askSide.LoadFromSnapshot(rows.asks, rows.askPrices);
        var bidSide = new Bids(new List<object>(), depth);
        bidSide.LoadFromSnapshot(rows.bids, rows.bidPrices);
        copy.asks = askSide;
        copy.bids = bidSide;
        copy.nonce = this.nonce;
        copy.timestamp = this.timestamp;
        copy["datetime"] = this["datetime"];
        copy.symbol = this.symbol;
        if (this.ContainsKey("outcome"))
        {
            copy["outcome"] = this["outcome"];
            copy["outcomeId"] = Exchange.SafeValue(this as dict, "outcomeId");
            copy["market"] = Exchange.SafeValue(this as dict, "market");
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

public class CountedOrderBook : OrderBook, IOrderBook
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

    public CountedOrderBook(object snapshot = null, object depth2 = null) : base(Exchange.Extend(snapshot ?? new Dictionary<string, object>(), new CustomConcurrentDictionary<string, object> {
       {"asks", new CountedAsks(Exchange.SafeValue(snapshot ?? new Dictionary<string,object>(), "asks", new SlimConcurrentList<object>()), depth2)},
       {"bids", new CountedBids(Exchange.SafeValue(snapshot ?? new Dictionary<string,object>(), "bids", new SlimConcurrentList<object>()), depth2)}
    }), depth2)
    {
    }

    public IOrderBook limit()
    {
        // Trimming is the owner loop's job (PublishRows trims both sides after every
        // mutation), so a caller never mutates the live book here.
        return this;
    }


    public IOrderBook Copy()
    {
        // Build from the owner's last publication, never from the live sides: this
        // runs on the caller's thread, the sides are mutated on the receive loop.
        var rows = this.PublishedRows();
        var depth = (this.asks is OrderBookSide askDepth) ? askDepth._depth : 0;
        var copy = new CountedOrderBook(new Dictionary<string, object>());
        var askSide = new CountedAsks(new List<object>(), depth);
        askSide.LoadFromSnapshot(rows.asks, rows.askPrices);
        var bidSide = new CountedBids(new List<object>(), depth);
        bidSide.LoadFromSnapshot(rows.bids, rows.bidPrices);
        copy.asks = askSide;
        copy.bids = bidSide;
        copy.nonce = this.nonce;
        copy.timestamp = this.timestamp;
        copy["datetime"] = this["datetime"];
        copy.symbol = this.symbol;
        if (this.ContainsKey("outcome"))
        {
            copy["outcome"] = this["outcome"];
            copy["outcomeId"] = Exchange.SafeValue(this as dict, "outcomeId");
            copy["market"] = Exchange.SafeValue(this as dict, "market");
        }
        copy.PublishRows();
        return copy;
    }

}


public class IndexedOrderBook : OrderBook, IOrderBook
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
    public IndexedOrderBook(object snapshot = null, object depth2 = null) : base(Exchange.Extend(snapshot ?? new Dictionary<string, object>(), new CustomConcurrentDictionary<string, object> {
       {"asks", new IndexedAsks(Exchange.SafeValue(snapshot ?? new Dictionary<string,object>(), "asks", new SlimConcurrentList<object>()), depth2)},
       {"bids", new IndexedBids(Exchange.SafeValue(snapshot ?? new Dictionary<string,object>(), "bids", new SlimConcurrentList<object>()), depth2)}
    }), depth2)
    {
    }

    public IOrderBook limit()
    {
        // Trimming is the owner loop's job (PublishRows trims both sides after every
        // mutation), so a caller never mutates the live book here.
        return this;
    }


    public IOrderBook Copy()
    {
        // Build from the owner's last publication, never from the live sides: this
        // runs on the caller's thread, the sides are mutated on the receive loop.
        var rows = this.PublishedRows();
        var depth = (this.asks is OrderBookSide askDepth) ? askDepth._depth : 0;
        var copy = new IndexedOrderBook(new Dictionary<string, object>());
        var askSide = new IndexedAsks(new List<object>(), depth);
        askSide.LoadFromSnapshot(rows.asks, rows.askPrices);
        var bidSide = new IndexedBids(new List<object>(), depth);
        bidSide.LoadFromSnapshot(rows.bids, rows.bidPrices);
        copy.asks = askSide;
        copy.bids = bidSide;
        copy.nonce = this.nonce;
        copy.timestamp = this.timestamp;
        copy["datetime"] = this["datetime"];
        copy.symbol = this.symbol;
        if (this.ContainsKey("outcome"))
        {
            copy["outcome"] = this["outcome"];
            copy["outcomeId"] = Exchange.SafeValue(this as dict, "outcomeId");
            copy["market"] = Exchange.SafeValue(this as dict, "market");
        }
        copy.PublishRows();
        return copy;
    }

}
