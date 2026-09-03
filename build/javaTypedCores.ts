// Closed allowlist for the Java typed cores (ccxt/ccxt#30066 Java analogue).
//
// THIS TABLE IS DERIVED. Do not hand-edit it:
//
//     python3 build/javaTypedCoresClosedSet.py            # report the fixed point
//     python3 build/javaTypedCoresClosedSet.py --write    # rewrite TYPED_CORES / PREDICTION_TYPED_CORES
//     python3 build/javaTypedCoresClosedSet.py --check    # CI: non-zero if the tables drifted
//
// A name is typed on a tier only if ALL hold (each rule is measured from the
// generated java/lib tree; the tiers are coupled by rule 4, so the script
// iterates until it drops 0 names):
//  1. every wrapper that converts it does so via `new T(res)` / toTypedList(res, T::new)
//     with ONE family T (a bare cast, or two families, excludes the name);
//  2. T is invertible: build/generateJavaTypedCoreHelpers.py --capabilities lists it.
//     Every generated type retains `public final Object __raw`, so from* hands back
//     the exact payload (dictionary containers such as Tickers / Balances / OrderBook
//     included -- a lossy field-set rebuild is NOT an inverse);
//  3. every declaration of the name on the tier is in the transpiled
//     `CompletableFuture<..> name(..) { return supplyAsync(..); }` shape that
//     build/typeJavaCores.py can retype. BaseExchange.fetchMarkets / fetchCurrencies
//     are hand-written and therefore excluded (Java generics are invariant, exactly
//     like C# CS0508, so one untypeable declaration excludes the whole name);
//  4. a name declared on the shared BaseExchange is inherited by BOTH Exchange and
//     PredictionExchange and must resolve to the same family on both tiers
//     (fetchSpotTickers: Tickers vs PredictionTickers -> typed on neither);
//  5. no hand-written code above the TRANSPILED marker consumes the value
//     (loadMarkets -> setMarkets expects raw maps);
//  6. policy: watch* (live cache identity), parse* (inputs to further transpiled
//     logic), *Ws, and the runtime-shape opt-outs listed in the script
//     (fetchDepositAddressesByNetwork / fetchDepositAddress / fetchAllGreeks declare
//     List<T> but return dicts; prediction cancelAllOrders on myriad returns
//     {cancelled_count, market_ids_affected}).
//
// Every non-tail consumer of a typed core is wrapped in the inverse by
// build/typeJavaCores.py; build/auditJavaTypedCoreLeaks.py proves there is none left.

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
    'fetchBalance': 'Balances',
    'fetchBidsAsks': 'Tickers',
    'fetchBorrowInterest': 'List<BorrowInterest>',
    'fetchCanceledAndClosedOrders': 'List<Order>',
    'fetchCanceledOrders': 'List<Order>',
    'fetchClosedOrders': 'List<Order>',
    'fetchContractDepositAddress': 'DepositAddress',
    'fetchContractOHLCV': 'List<OHLCV>',
    'fetchConvertCurrencies': 'Currencies',
    'fetchConvertQuote': 'Conversion',
    'fetchConvertTrade': 'Conversion',
    'fetchConvertTradeHistory': 'List<Conversion>',
    'fetchCrossBorrowRate': 'CrossBorrowRate',
    'fetchCrossBorrowRates': 'CrossBorrowRates',
    'fetchDepositAddresses': 'List<DepositAddress>',
    'fetchDepositWithdrawFee': 'DepositWithdrawFee',
    'fetchDepositWithdrawFees': 'DepositWithdrawFees',
    'fetchDeposits': 'List<Transaction>',
    'fetchDepositsWithdrawals': 'List<Transaction>',
    'fetchFreeBalance': 'Balance',
    'fetchFundingHistory': 'List<FundingHistory>',
    'fetchFundingInterval': 'FundingRate',
    'fetchFundingIntervals': 'FundingRates',
    'fetchFundingRate': 'FundingRate',
    'fetchFundingRateHistory': 'List<FundingRateHistory>',
    'fetchFundingRates': 'FundingRates',
    'fetchGreeks': 'Greeks',
    'fetchIndexOHLCV': 'List<OHLCV>',
    'fetchIsolatedBorrowRate': 'IsolatedBorrowRate',
    'fetchIsolatedBorrowRates': 'IsolatedBorrowRates',
    'fetchL3OrderBook': 'OrderBook',
    'fetchLastPrices': 'LastPrices',
    'fetchLedger': 'List<LedgerEntry>',
    'fetchLedgerEntry': 'LedgerEntry',
    'fetchLeverage': 'Leverage',
    'fetchLeverageTiers': 'LeverageTiers',
    'fetchLeverages': 'Leverages',
    'fetchLiquidations': 'List<Liquidation>',
    'fetchLongShortRatio': 'LongShortRatio',
    'fetchLongShortRatioHistory': 'List<LongShortRatio>',
    'fetchMarginAdjustmentHistory': 'List<MarginModification>',
    'fetchMarginMode': 'MarginMode',
    'fetchMarginModes': 'MarginModes',
    'fetchMarkOHLCV': 'List<OHLCV>',
    'fetchMarkPrice': 'Ticker',
    'fetchMarkPrices': 'Tickers',
    'fetchMarketLeverageTiers': 'List<LeverageTier>',
    'fetchMyLiquidations': 'List<Liquidation>',
    'fetchMyTrades': 'List<Trade>',
    'fetchOHLCV': 'List<OHLCV>',
    'fetchOpenInterest': 'OpenInterest',
    'fetchOpenInterests': 'OpenInterests',
    'fetchOpenOrders': 'List<Order>',
    'fetchOption': 'Option',
    'fetchOptionChain': 'OptionChain',
    'fetchOrder': 'Order',
    'fetchOrderBook': 'OrderBook',
    'fetchOrderBooks': 'OrderBooks',
    'fetchOrderTrades': 'List<Trade>',
    'fetchOrderWithClientOrderId': 'Order',
    'fetchOrders': 'List<Order>',
    'fetchPartialBalance': 'Balance',
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
    'fetchTickers': 'Tickers',
    'fetchTotalBalance': 'Balance',
    'fetchTrades': 'List<Trade>',
    'fetchTradingFee': 'TradingFeeInterface',
    'fetchTradingFees': 'TradingFees',
    'fetchTransactions': 'List<Transaction>',
    'fetchTransfer': 'TransferEntry',
    'fetchTransfers': 'List<TransferEntry>',
    'fetchUnifiedOrder': 'Order',
    'fetchUsedBalance': 'Balance',
    'fetchWithdrawals': 'List<Transaction>',
    'setMargin': 'MarginModification',
    'transfer': 'TransferEntry',
    'withdraw': 'Transaction',
};

export const PREDICTION_TYPED_CORES: Record<string, string> = {
    'cancelOrder': 'PredictionOrder',
    'cancelOrders': 'List<PredictionOrder>',
    'createConvertTrade': 'Conversion',
    'createDepositAddress': 'DepositAddress',
    'createMarketBuyOrderWithCost': 'PredictionOrder',
    'createMarketOrderWithCost': 'PredictionOrder',
    'createMarketSellOrderWithCost': 'PredictionOrder',
    'createOrder': 'PredictionOrder',
    'createOrders': 'List<PredictionOrder>',
    'editOrder': 'PredictionOrder',
    'fetchADLRank': 'ADL',
    'fetchAccounts': 'List<Account>',
    'fetchBalance': 'Balances',
    'fetchBorrowInterest': 'List<BorrowInterest>',
    'fetchCanceledOrders': 'List<PredictionOrder>',
    'fetchClosedOrders': 'List<PredictionOrder>',
    'fetchContractDepositAddress': 'DepositAddress',
    'fetchContractOHLCV': 'List<OHLCV>',
    'fetchConvertCurrencies': 'Currencies',
    'fetchConvertQuote': 'Conversion',
    'fetchConvertTrade': 'Conversion',
    'fetchConvertTradeHistory': 'List<Conversion>',
    'fetchCrossBorrowRate': 'CrossBorrowRate',
    'fetchCrossBorrowRates': 'CrossBorrowRates',
    'fetchDepositAddresses': 'List<DepositAddress>',
    'fetchDepositWithdrawFee': 'DepositWithdrawFee',
    'fetchDepositWithdrawFees': 'DepositWithdrawFees',
    'fetchDeposits': 'List<Transaction>',
    'fetchDepositsWithdrawals': 'List<Transaction>',
    'fetchEvent': 'PredictionEvent',
    'fetchEvents': 'List<PredictionEvent>',
    'fetchFreeBalance': 'Balance',
    'fetchFundingHistory': 'List<FundingHistory>',
    'fetchFundingInterval': 'FundingRate',
    'fetchFundingIntervals': 'FundingRates',
    'fetchFundingRate': 'FundingRate',
    'fetchFundingRateHistory': 'List<FundingRateHistory>',
    'fetchFundingRates': 'FundingRates',
    'fetchGreeks': 'Greeks',
    'fetchIndexOHLCV': 'List<OHLCV>',
    'fetchIsolatedBorrowRate': 'IsolatedBorrowRate',
    'fetchIsolatedBorrowRates': 'IsolatedBorrowRates',
    'fetchLastPrices': 'LastPrices',
    'fetchLedger': 'List<LedgerEntry>',
    'fetchLedgerEntry': 'LedgerEntry',
    'fetchLeverage': 'Leverage',
    'fetchLeverageTiers': 'LeverageTiers',
    'fetchLeverages': 'Leverages',
    'fetchLiquidations': 'List<Liquidation>',
    'fetchLongShortRatio': 'LongShortRatio',
    'fetchLongShortRatioHistory': 'List<LongShortRatio>',
    'fetchMarginAdjustmentHistory': 'List<MarginModification>',
    'fetchMarginMode': 'MarginMode',
    'fetchMarginModes': 'MarginModes',
    'fetchMarkOHLCV': 'List<OHLCV>',
    'fetchMarketLeverageTiers': 'List<LeverageTier>',
    'fetchMyLiquidations': 'List<Liquidation>',
    'fetchMyTrades': 'List<PredictionTrade>',
    'fetchOHLCV': 'List<OHLCV>',
    'fetchOpenInterest': 'PredictionOpenInterest',
    'fetchOpenInterests': 'OpenInterests',
    'fetchOpenOrders': 'List<PredictionOrder>',
    'fetchOption': 'Option',
    'fetchOptionChain': 'OptionChain',
    'fetchOrder': 'PredictionOrder',
    'fetchOrderBook': 'PredictionOrderBook',
    'fetchOrderBooks': 'OrderBooks',
    'fetchOrderTrades': 'List<PredictionTrade>',
    'fetchOrders': 'List<PredictionOrder>',
    'fetchPartialBalance': 'Balance',
    'fetchPosition': 'PredictionPosition',
    'fetchPositionADLRank': 'ADL',
    'fetchPositionMode': 'PositionModeInfo',
    'fetchPositions': 'List<PredictionPosition>',
    'fetchPositionsADLRank': 'List<ADL>',
    'fetchPremiumIndexOHLCV': 'List<OHLCV>',
    'fetchSettlements': 'List<PredictionSettlement>',
    'fetchSpotOHLCV': 'List<OHLCV>',
    'fetchStatus': 'Status',
    'fetchTicker': 'PredictionTicker',
    'fetchTickers': 'PredictionTickers',
    'fetchTotalBalance': 'Balance',
    'fetchTrades': 'List<PredictionTrade>',
    'fetchTradingFee': 'PredictionTradingFee',
    'fetchTradingFees': 'TradingFees',
    'fetchTransactions': 'List<Transaction>',
    'fetchTransfer': 'TransferEntry',
    'fetchTransfers': 'List<TransferEntry>',
    'fetchUsedBalance': 'Balance',
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
