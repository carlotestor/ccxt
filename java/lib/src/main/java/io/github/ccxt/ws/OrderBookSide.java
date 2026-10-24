package io.github.ccxt.ws;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.LinkedBlockingQueue;

/**
 * Sorted order book side (bids or asks) with O(log n) price lookup.
 * Matches C# OrderBookSide.cs and JS OrderBookSide.ts.
 *
 * Asks: ascending price order (index stores positive prices)
 * Bids: descending price order (index stores negated prices)
 *
 * <h2>Ownership</h2>
 * The exchange ws owner thread is the only writer of the rows and the price index (every
 * store/storeArray call site is a ws frame handler). Readers only see the immutable row copy
 * published after each mutation, and a trim asked for by a reader is queued for the owner
 * instead of truncating live rows off-thread.
 */
public class OrderBookSide extends ArrayList<Object> implements io.github.ccxt.IOrderBookSide {

    private static final Object TRIM = new Object();

    protected final boolean side; // true = bids (descending), false = asks (ascending)
    protected int depth;
    protected final ArrayList<BigDecimal> index = new ArrayList<>();

    /** Owner-to-reader hand-off: the last published immutable row copy. */
    private final OwnerSlot<List<Object>> publishedRows = new OwnerSlot<>();

    /** Reader-to-owner hand-off: trims requested by user threads. */
    private final LinkedBlockingQueue<Object> trimRequests = new LinkedBlockingQueue<>();

    public OrderBookSide(List<Object> deltas, Object depthObj, boolean side) {
        super();
        this.side = side;
        this.depth = (depthObj == null) ? Integer.MAX_VALUE : ((Number) depthObj).intValue();
        this.beginBatch();
        if (deltas != null) {
            for (Object delta : deltas) {
                this.storeArrayUnsafe(delta);
            }
        }
        this.endBatch();
    }

    public OrderBookSide(boolean side) {
        this(null, null, side);
    }

    /**
     * Binary search for insertion point (left-biased).
     */
    public static int bisectLeft(ArrayList<BigDecimal> arr, BigDecimal x) {
        int low = 0;
        int high = arr.size() - 1;
        while (low <= high) {
            int mid = (low + high) >>> 1;
            if (arr.get(mid).compareTo(x) < 0) low = mid + 1;
            else high = mid - 1;
        }
        return low;
    }

    /** >0 while a multi-row write is in flight, so readers never see a half-built side. */
    private int publishBatch = 0; // owner thread only

    /** Start a multi-row write: nothing is published until the matching {@link #endBatch}. */
    protected final void beginBatch() {
        this.publishBatch++;
    }

    /** Finish a multi-row write and publish the result once. */
    protected final void endBatch() {
        this.publishBatch--;
        if (this.publishBatch <= 0) {
            this.publishBatch = 0;
            this.publishRows();
        }
    }

    /** Publish the rows a reader may iterate: always capped at depth, never live state. */
    protected final void publishRows() {
        if (this.publishBatch > 0) {
            return;
        }
        int size = this.size();
        List<Object> copy;
        if (this.depth >= 0 && this.depth < size) {
            copy = new ArrayList<>(this.subList(0, this.depth));
        } else {
            copy = new ArrayList<>(this);
        }
        this.publishedRows.publish(Collections.unmodifiableList(copy));
    }

    /** Apply a trim a reader asked for; owner thread only, at the start of a mutation. */
    protected final void drainTrim() {
        if (this.trimRequests.isEmpty()) {
            return;
        }
        while (this.trimRequests.poll() != null) {
            // one trim satisfies every request queued before it
        }
        this.trimNow();
    }

    /** Truncate the tail rows past depth; overloaded by the id-keyed side. */
    protected void trimNow() {
        int excess = this.size() - this.depth;
        for (int i = 0; i < excess; i++) {
            int last = this.size() - 1;
            this.remove(last);
            this.index.remove(last);
        }
    }

    protected final void requestTrim() {
        this.trimRequests.offer(TRIM);
    }

    /**
     * Apply a [price, amount] delta. amount==0 removes the level; null price or
     * null/NaN amount is a no-op (matches JS truthy / C# decimal? behavior).
     */
    public void storeArray(Object delta2) {
        this.storeArrayUnsafe(delta2);
    }

    @SuppressWarnings("unchecked")
    void storeArrayUnsafe(Object delta2) {
        this.drainTrim();
        List<Object> delta = (List<Object>) delta2;
        BigDecimal price = toBigDecimal(delta.get(0));
        if (price == null) {
            this.publishRows();
            return;
        }
        // Amount is only tested for zero / nonzero / missing. Do not build a
        // BigDecimal (valueOf -> toString + parse) just to ask that; the row
        // keeps the caller's original object. NaN/Inf/null -> no-op.
        double amount = (delta.get(1) instanceof Number n) ? n.doubleValue() : Double.NaN;
        // Bids store the negated price so a single ascending index list serves both sides.
        BigDecimal indexPrice = this.side ? price.negate() : price;
        int idx = bisectLeft(this.index, indexPrice);
        if (Double.isFinite(amount) && amount != 0) {
            if (idx < this.index.size() && this.index.get(idx).compareTo(indexPrice) == 0) {
                // Replace the inner list whole-cloth: published snapshots shallow-copy, so an
                // in-place set(1, amount) would still race with concurrent readers.
                this.set(idx, new ArrayList<>(delta));
            } else {
                this.index.add(idx, indexPrice);
                this.add(idx, new ArrayList<>(delta));
            }
        } else if (amount == 0 && idx < this.index.size() && this.index.get(idx).compareTo(indexPrice) == 0) {
            this.index.remove(idx);
            this.remove(idx);
        }
        this.publishRows();
    }

    public void store(Object price, Object amount) {
        List<Object> delta = new ArrayList<>();
        delta.add(price);
        delta.add(amount);
        this.storeArrayUnsafe(delta);
    }

    public void store(Object price, Object amount, Object orderId) {
        List<Object> delta = new ArrayList<>();
        delta.add(price);
        delta.add(amount);
        delta.add(orderId);
        this.storeArrayUnsafe(delta);
    }

    /**
     * Truncate to max depth. Called explicitly by exchange code after applying deltas.
     * A caller that is not the owner (a user thread calling watchOrderBook().limit()) only
     * queues the trim: live rows are never truncated off the owner thread.
     */
    public void limit() {
        this.requestTrim();
    }

    /** The inherited ArrayList.clear() dropped the rows but left the price
     *  index populated; WsOrderBook.reset() compensated with a separate
     *  index.clear(), so the live path was fine, but a standalone clear()
     *  would leave bisect operating against ghost prices — keep the two in
     *  lockstep here, see the review note on
     *  https://github.com/ccxt/ccxt/pull/29753 */
    @Override
    public void clear() {
        super.clear();
        this.index.clear();
        this.publishRows();
    }

    /** Snapshot copy for safe iteration outside the owner thread. */
    public List<Object> snapshot() {
        return this.publishedRows.latest(Collections.emptyList());
    }

    public OrderBookSide copy() {
        if (this instanceof Asks) {
            return new Asks(this.snapshot(), this.depth);
        } else if (this instanceof Bids) {
            return new Bids(this.snapshot(), this.depth);
        } else {
            return new OrderBookSide(this.snapshot(), this.depth, this.side);
        }
    }

    private static BigDecimal toBigDecimal(Object val) {
        if (val == null) return null;
        if (val instanceof BigDecimal bd) return bd;
        if (val instanceof Number n) {
            double d = n.doubleValue();
            if (Double.isNaN(d) || Double.isInfinite(d)) return null;
            return BigDecimal.valueOf(d);
        }
        if (val instanceof String s) {
            try { return new BigDecimal(s); } catch (NumberFormatException e) { return null; }
        }
        return null;
    }

    // ─── Subclasses ───

    public static class Asks extends OrderBookSide {
        public Asks(List<Object> deltas, Object depth) { super(deltas, depth, false); }
        public Asks() { super(false); }
    }

    public static class Bids extends OrderBookSide {
        public Bids(List<Object> deltas, Object depth) { super(deltas, depth, true); }
        public Bids() { super(true); }
    }
}
