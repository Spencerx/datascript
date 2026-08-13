# Tuples

A tuple is a collection of scalar values, represented in memory as a Clojure vector.

There are three kinds of tuples:

- [Composite tuples](#composite-tuples) (`:db/tupleAttrs`) are derived from other attributes of the same entity and managed by DataScript;
- [Heterogeneous tuples](#heterogeneous-tuples) (`:db/tupleTypes`) are fixed-length tuples with a declared type per slot, asserted by you;
- [Homogeneous tuples](#homogeneous-tuples) (`:db/tupleType`) are variable-length tuples with a single declared element type, asserted by you.

# Composite tuples

Composite tuples are applicable:

- when a domain entity has a multi-attribute key;
- to optimize a query that joins more than one high-population attributes on the same entity.

Composite attributes are entirely managed by DataScript–you never assert or retract them yourself. Whenever you assert or retract any attribute that is part of a composite, DataScript will automatically populate the composite value. If the current value of an entity does not include all attributes of a composite, the missing attributes will be nil.

Some ground rules:

- tuple attribute must be of cardinality one;
- tuple attribute can’t reference cardinality many attributes;
- tuple attribute can’t reference other tuple attributes;
- tuple attributes are indexed by default.

For example, consider the domain with attributes :a, :b, :c and a composite tuple `:a+b+c`

```
{:a+b+c {:db/tupleAttrs [:a :b :c]}}
```

If we transact something like this:

```
[{:db/id 1, :a "a", :b "b"}]
```

you might notice that entity 1 got composite attribute `:a+b+c` populated automatically:

```
(d/pull db '[*] 1)
; => {:db/id 1, :a "a", :b "b", :a+b+c ["a" "b" nil]}
```

If you change attributes, tuple value is updated automatically:

```
(d/transact! conn
  [{:db/id 1, :a "A", :b "B", :c "c"}])
; => {:db/id 1, :a "A", :b "B", :c "c", :a+b+c ["A" "B" "c"]}
```

If you remove ALL attributes that make up a tuple, tuple attribute is retracted too:

```
(d/transact! conn
  [[:db/add 1 :d "d"]
   [:db/retract 1 :a]
   [:db/retract 1 :b]
   [:db/retract 1 :c]])
; => {:db/id 1, :d "d"}
```

Direct update of tuple attributes is not allowed:

```
(d/transact! conn
  [{:db/id 1, :a+b+c ["A" "B" "c"]}])
; => clojure.lang.ExceptionInfo: Can’t modify tuple attrs directly: [:db/add 1 :a+b+c ["A" "B" "c"]]
```

Tuple attributes are automatically indexed:

```
(d/index-range db :a+b+c ["A" "B" "C"] ["a" "b" "c"])
; => [#db/Datom 1 :a+b+c ["a" "b" "c"]]
```

If you mark tuple attribute as `:db/unique :db.unique/value`, you get an uniqueness by composite key.

```
(def conn (d/create-conn {:a+b {:db/tupleAttrs [:a :b]
                                :db/unique :db.unique/value}}))

(d/transact! conn
  [{:db/id 1, :a "A", :b "B"}
   {:db/id 2, :a "A", :b "b"}
   {:db/id 3, :a "a", :b "B"}
   {:db/id 4, :a "a", :b "b"}])
```

Neither `:a` nor `:b` are unique per se, but their combination together is, enforced by DataScript:

```
(d/transact! conn
  [{:db/id 5, :a "A", :b "B"}])
; => clojure.lang.ExceptionInfo: Cannot add #datascript/Datom [5 :a+b ["A" "B"] 536870916 true] because of unique constraint: (#datascript/Datom [1 :a+b ["A" "b"] 536870915 true])
```

If you mark tuple attribute as `:db/unique :db.unique/identity`, you might use it in lookup refs:

```
(def conn (d/create-conn {:a+b {:db/tupleAttrs [:a :b]
                                :db/unique :db.unique/identity}}))

(d/entity (d/db conn) [:a+b ["a" "b"]])
; => {:db/id 4, :a "a", :b "b", :a+b ["a" "b"]}
```

Composite tuples are like normal attributes in most cases. Feel free to use them in lookup refs, upserts, queries, index access.

# Heterogeneous tuples

Heterogeneous tuples have a fixed length, with a type declared per slot:

```
(def conn (d/create-conn
            {:player/location {:db/valueType :db.type/tuple
                               :db/tupleTypes [:db.type/long :db.type/long]}}))
```

Unlike composite tuples, you assert and retract them yourself:

```
(d/transact! conn
  [{:player/handle "Argent Adept"
    :player/location [100 0]}])
```

DataScript validates that the value is a vector of the declared length. `nil` is a legal value for any slot:

```
(d/transact! conn [[:db/add 1 :player/location [100 nil]]])
```

Slot types other than `:db.type/ref` are not enforced — DataScript is dynamically typed and treats them as documentation. Datomic’s limits (max 8 elements, strings ≤ 256 chars) are not enforced either. Keep the types in each slot consistent though, otherwise index sorting might fail.

`:db.type/ref` slots are special: entity ids, lookup refs, idents, tempids and `:db/current-tx` in them are resolved the same way ref attribute values are:

```
(def conn (d/create-conn
            {:name     {:db/unique :db.unique/identity}
             :ref+long {:db/valueType :db.type/tuple
                        :db/tupleTypes [:db.type/ref :db.type/long]}}))

(d/transact! conn
  [{:db/id -1 :name "Ivan"}
   [:db/add 2 :ref+long [-1 7]]])           ; tempid, resolves to Ivan’s eid

(d/transact! conn
  [[:db/add 2 :ref+long [[:name "Ivan"] 8]]]) ; lookup ref works too
```

Ref slots are resolved on read, too: lookup refs and idents can be used anywhere a tuple value is expected, and are resolved against the current db.

```
(d/datoms db :avet :ref+long [[:name "Ivan"] 8])
(d/index-range db :ref+long [[:name "Ivan"] 0] [[:name "Ivan"] 100])
(d/q '[:find ?e :where [?e :ref+long [[:name "Ivan"] 8]]] db)
(d/q '[:find ?e :in $ [?t ...] :where [?e :ref+long ?t]] db [[[:name "Ivan"] 8]])
```

This works for composite tuples with ref attributes as well. A lookup ref that resolves to nothing raises, same as it does for plain `:db.type/ref` attributes.

Refs inside tuples are not full-fledged references otherwise: they don’t show up in reverse index, don’t get retracted when the referenced entity is retracted (the eid stays in the tuple, dangling), can’t be `:db/isComponent`, and entity API returns them as plain numbers, not entities. Same is true in Datomic.

Unlike composite tuples, heterogeneous and homogeneous tuples are not indexed by default. Add `:db/index true` or `:db/unique` if you want AVET access. Unique declared tuples work in upserts and lookup refs, same as composite ones:

```
(d/entity (d/db conn) [:ref+long [[:name "Ivan"] 8]])
```

Unlike Datomic, heterogeneous and homogeneous tuples can be `:db.cardinality/many`. Note that in map form multiple values must be wrapped in an extra vector, otherwise a single tuple will be interpreted as multiple values:

```
(d/transact! conn [{:db/id 1, :locations [[100 0] [200 300]]}]) ; two tuples
```

# Homogeneous tuples

Homogeneous tuples have variable length and a single type declared for all elements:

```
(def conn (d/create-conn
            {:keywords {:db/valueType :db.type/tuple
                        :db/tupleType :db.type/keyword}}))

(d/transact! conn [[:db/add 1 :keywords [:a :b :c]]])
```

Everything said about heterogeneous tuples applies: only the vector shape is validated, `:db.type/ref` element type gets full ref resolution in every slot, indexing is opt-in. Note that vectors sort by length first, so `index-range` over different-length tuples is not lexicographic.