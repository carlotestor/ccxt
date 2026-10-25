using System.Collections.Concurrent;

namespace ccxt.pro;

public class CustomConcurrentDictionary<TKey, TValue> : ConcurrentDictionary<TKey, TValue>
{


    public CustomConcurrentDictionary()
    {
        // Default constructor, does nothing
    }

    public CustomConcurrentDictionary(IEnumerable<KeyValuePair<TKey, TValue>> initialValues)
    {
        foreach (var kvp in initialValues)
        {
            this[kvp.Key] = kvp.Value;
        }

    }

    public void Add(TKey key, TValue value)
    {
        this[key] = value;
    }
}