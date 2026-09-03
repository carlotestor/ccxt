// SHARED CONTRACT for the Java typed-cores work (ccxt/ccxt#30066 Java analogue).
// Written by the orchestrator. Both implementation slices code against THIS file.
//
// Java analogue of build/csharpTranspiler.ts TYPED_CORES / PREDICTION_TYPED_CORES.
//
// A name may appear here only if ALL hold (closed set, iterate to fixed point):
//  1. every wrapper that converts it does so via `new T(res)` / toTypedList(res, T::new)
//     (NOT a bare cast) -- a cast-only wrapper must never be typed;
//  2. the family T has a mechanically invertible `T(Object raw)` constructor
//     (see build/generateJavaTypedCoreHelpers.py -- it PARSES the constructors);
//  3. every declaration of the name across base + all exchanges agrees on T
//     (Java generics are invariant: CompletableFuture<Ticker> is NOT a
//      CompletableFuture<Object>, so this is all-or-nothing per name, exactly
//      like C# CS0508);
//  4. any intra-core call site that is not a tail `return this.X(...)` is
//     wrapped by the reverse helper, so a typed value never lands in an
//     untyped Object local.
//
// Deliberately EXCLUDED (mirrors #30066, reasons are language-independent):
//  - watch*  : the core hands back the live cache instance whose identity matters.
//  - parse*  : results are inputs to further transpiled logic, not terminal.
//  - non-invertible dictionary-like containers: Tickers, Balances, Currencies,
//    FundingRates, TradingFees, LeverageTiers, OptionChain, MarginModes,
//    Leverages, OpenInterests, CrossBorrowRates, IsolatedBorrowRates,
//    DepositWithdrawFees, LastPrices, MarketInterface, OrderBook, OrderBooks.
//    Their constructors splat into Map<String,T> and cannot be inverted, so a
//    consuming call site would read null silently.

export const REVERSIBLE_FAMILIES: string[] = [];   // filled by the helper generator's --capabilities output

export const TYPED_CORES: Record<string, string> = {
    'cancelAllOrders': 'List<Order>',
    'cancelOrder': 'Order',
    'cancelOrderWithClientOrderId': 'Order',
    'cancelOrders': 'List<Order>',
    'cancelOrdersWithClientOrderIds': 'List<Order>',
    'cancelUnifiedOrder': 'Order',
    'closeAllPositions': 'List<Position>',
    'closePosition': 'Order',
    'createConvertTrade': 'Conversion',
    'createDepositAddress': 'DepositAddress',
    'createLimitBuyOrder': 'Order',
    'createLimitOrder': 'Order',
    'createLimitSellOrder': 'Order',
    'createMarketBuyOrder': 'Order',
    'createMarketBuyOrderWithCost': 'Order',
    'createMarketOrder': 'Order',
    'createMarketOrderWithCost': 'Order',
    'createMarketSellOrder': 'Order',
    'createMarketSellOrderWithCost': 'Order',
    'createOrder': 'Order',
    'createOrderWithTakeProfitAndStopLoss': 'Order',
    'createOrders': 'List<Order>',
    'createPostOnlyOrder': 'Order',
    'createReduceOnlyOrder': 'Order',
    'createStopLimitOrder': 'Order',
    'createStopLossOrder': 'Order',
    'createStopMarketOrder': 'Order',
    'createStopOrder': 'Order',
    'createTakeProfitOrder': 'Order',
    'createTrailingAmountOrder': 'Order',
    'createTrailingPercentOrder': 'Order',
    'createTriggerOrder': 'Order',
    'editLimitBuyOrder': 'Order',
    'editLimitOrder': 'Order',
    'editLimitSellOrder': 'Order',
    'editOrder': 'Order',
    'editOrderWithClientOrderId': 'Order',
    'editOrders': 'List<Order>',
    'fetchADLRank': 'ADL',
    'fetchAccounts': 'List<Account>',
    'fetchBorrowInterest': 'List<BorrowInterest>',
    'fetchCanceledAndClosedOrders': 'List<Order>',
    'fetchCanceledOrders': 'List<Order>',
    'fetchClosedOrders': 'List<Order>',
    'fetchContractDepositAddress': 'DepositAddress',
    'fetchContractOHLCV': 'List<OHLCV>',
    'fetchConvertQuote': 'Conversion',
    'fetchConvertTrade': 'Conversion',
    'fetchConvertTradeHistory': 'List<Conversion>',
    'fetchCrossBorrowRate': 'CrossBorrowRate',
    'fetchDepositAddresses': 'List<DepositAddress>',
    'fetchDeposits': 'List<Transaction>',
    'fetchDepositsWithdrawals': 'List<Transaction>',
    'fetchFundingHistory': 'List<FundingHistory>',
    'fetchFundingInterval': 'FundingRate',
    'fetchFundingRate': 'FundingRate',
    'fetchFundingRateHistory': 'List<FundingRateHistory>',
    'fetchGreeks': 'Greeks',
    'fetchIndexOHLCV': 'List<OHLCV>',
    'fetchIsolatedBorrowRate': 'IsolatedBorrowRate',
    'fetchLedger': 'List<LedgerEntry>',
    'fetchLedgerEntry': 'LedgerEntry',
    'fetchLeverage': 'Leverage',
    'fetchLiquidations': 'List<Liquidation>',
    'fetchLongShortRatio': 'LongShortRatio',
    'fetchLongShortRatioHistory': 'List<LongShortRatio>',
    'fetchMarginAdjustmentHistory': 'List<MarginModification>',
    'fetchMarginMode': 'MarginMode',
    'fetchMarkOHLCV': 'List<OHLCV>',
    'fetchMarkPrice': 'Ticker',
    'fetchMarketLeverageTiers': 'List<LeverageTier>',
    'fetchMyLiquidations': 'List<Liquidation>',
    'fetchMyTrades': 'List<Trade>',
    'fetchOHLCV': 'List<OHLCV>',
    'fetchOpenInterest': 'OpenInterest',
    'fetchOpenOrders': 'List<Order>',
    'fetchOption': 'Option',
    'fetchOrder': 'Order',
    'fetchOrderTrades': 'List<Trade>',
    'fetchOrderWithClientOrderId': 'Order',
    'fetchOrders': 'List<Order>',
    'fetchPosition': 'Position',
    'fetchPositionADLRank': 'ADL',
    'fetchPositionHistory': 'List<Position>',
    'fetchPositionMode': 'PositionModeInfo',
    'fetchPositions': 'List<Position>',
    'fetchPositionsADLRank': 'List<ADL>',
    'fetchPositionsForSymbol': 'List<Position>',
    'fetchPositionsHistory': 'List<Position>',
    'fetchPositionsRisk': 'List<Position>',
    'fetchPremiumIndexOHLCV': 'List<OHLCV>',
    'fetchSpotOHLCV': 'List<OHLCV>',
    'fetchStatus': 'Status',
    'fetchTicker': 'Ticker',
    'fetchTrades': 'List<Trade>',
    'fetchTradingFee': 'TradingFeeInterface',
    'fetchTransactions': 'List<Transaction>',
    'fetchTransfer': 'TransferEntry',
    'fetchTransfers': 'List<TransferEntry>',
    'fetchUnifiedOrder': 'Order',
    'fetchWithdrawals': 'List<Transaction>',
    'setMargin': 'MarginModification',
    'transfer': 'TransferEntry',
    'withdraw': 'Transaction',
    // --- watch* -------------------------------------------------------------------
    // Java analogue of ccxt/ccxt#30110. A watch core hands back the LIVE ws structure
    // (the shared ticker dict, an ArrayCache*). `to<T>` materialises a NEW T from it,
    // which is exactly the snapshot the wrapper produced with `new T(res)` /
    // `toTypedList(res, T::new)`, so typing the core keeps the public semantics while
    // removing the wrapper's conversion. WS tests bind these STATICALLY (no reflective
    // detype), so build/javaTranspiler.ts wraps their call sites in
    // BaseTest.detypeForComparison on the ws-test path only (detypeWsTypedCoreCalls).
    'watchTicker': 'Ticker',
};

export const PREDICTION_TYPED_CORES: Record<string, string> = {
    // 'cancelAllOrders' is NOT typed on the prediction tier: kalshi, limitless and
    // polymarket declare `Promise<PredictionOrder[]>`, but myriad declares
    // `Promise<any>` and returns the venue's raw summary object
    // (`{ cancelled_count, market_ids_affected }`), not a list of orders. Rule 3
    // above is all-or-nothing per name, and typing it anyway makes myriad's static
    // response come back null instead of the payload.
    'createConvertTrade': 'Conversion',
    'createDepositAddress': 'DepositAddress',
    'createOrders': 'List<PredictionOrder>',
    'fetchADLRank': 'ADL',
    'fetchAccounts': 'List<Account>',
    'fetchBorrowInterest': 'List<BorrowInterest>',
    'fetchContractDepositAddress': 'DepositAddress',
    'fetchContractOHLCV': 'List<OHLCV>',
    'fetchConvertQuote': 'Conversion',
    'fetchConvertTrade': 'Conversion',
    'fetchConvertTradeHistory': 'List<Conversion>',
    'fetchCrossBorrowRate': 'CrossBorrowRate',
    'fetchDepositAddresses': 'List<DepositAddress>',
    'fetchDeposits': 'List<Transaction>',
    'fetchDepositsWithdrawals': 'List<Transaction>',
    'fetchFundingHistory': 'List<FundingHistory>',
    'fetchFundingInterval': 'FundingRate',
    'fetchFundingRate': 'FundingRate',
    'fetchFundingRateHistory': 'List<FundingRateHistory>',
    'fetchGreeks': 'Greeks',
    'fetchIndexOHLCV': 'List<OHLCV>',
    'fetchIsolatedBorrowRate': 'IsolatedBorrowRate',
    'fetchLedger': 'List<LedgerEntry>',
    'fetchLedgerEntry': 'LedgerEntry',
    'fetchLeverage': 'Leverage',
    'fetchLiquidations': 'List<Liquidation>',
    'fetchLongShortRatio': 'LongShortRatio',
    'fetchLongShortRatioHistory': 'List<LongShortRatio>',
    'fetchMarginAdjustmentHistory': 'List<MarginModification>',
    'fetchMarginMode': 'MarginMode',
    'fetchMarkOHLCV': 'List<OHLCV>',
    'fetchMarketLeverageTiers': 'List<LeverageTier>',
    'fetchMyLiquidations': 'List<Liquidation>',
    'fetchMyTrades': 'List<PredictionTrade>',
    'fetchOHLCV': 'List<OHLCV>',
    'fetchOpenInterest': 'PredictionOpenInterest',
    'fetchOption': 'Option',
    'fetchOrderTrades': 'List<PredictionTrade>',
    'fetchPosition': 'PredictionPosition',
    'fetchPositionADLRank': 'ADL',
    'fetchPositionMode': 'PositionModeInfo',
    'fetchPositionsADLRank': 'List<ADL>',
    'fetchPremiumIndexOHLCV': 'List<OHLCV>',
    'fetchSettlements': 'List<PredictionSettlement>',
    'fetchSpotOHLCV': 'List<OHLCV>',
    'fetchStatus': 'Status',
    'fetchTicker': 'PredictionTicker',
    'fetchTrades': 'List<PredictionTrade>',
    'fetchTradingFee': 'PredictionTradingFee',
    'fetchTransactions': 'List<Transaction>',
    'fetchTransfer': 'TransferEntry',
    'fetchTransfers': 'List<TransferEntry>',
    'fetchWithdrawals': 'List<Transaction>',
    'setMargin': 'MarginModification',
    'transfer': 'TransferEntry',
    'withdraw': 'Transaction',
};

// ---------------------------------------------------------------------------
// Generated-helper naming contract (build/generateJavaTypedCoreHelpers.py emits
// io/github/ccxt/TypedCores.java; the transpiler passes emit calls to these):
//
//   public static Ticker        toTicker(Object raw)            // null-safe, idempotent
//   public static List<Ticker>  toTickerList(Object raw)        // null-safe, idempotent
//   public static Object        fromTicker(Object v)            // Ticker -> Map; pass-through otherwise
//   public static Object        fromTickerList(Object v)        // List<Ticker> -> List<Map>; pass-through
//   public static Object        fromTyped(Object v)             // runtime switch over every reversible family
//
// All to*/from* are PASS-THROUGH when the value is not of the expected type, so
// they can be applied blindly.
// ---------------------------------------------------------------------------
