(ns datascript.test.issues
  (:require
    [datascript.core :as ds]
    [clojure.test :as t :refer [is are deftest testing]]))

(deftest ^{:doc "CLJS `apply` + `vector` will hold onto mutable array of arguments directly"}
  issue-262
  (let [db (ds/db-with (ds/empty-db)
             [{:attr "A"} {:attr "B"}])]
    (is (= (ds/q '[:find ?a ?b
                   :where [_ :attr ?a] 
                   [(vector ?a) ?b]]
             db)
          #{["A" ["A"]] ["B" ["B"]]}))))

(deftest ^{:doc "`empty` should preserve meta of db"}
  issue-331
  (let [m  {:foo :bar}
        db (-> (ds/empty-db)
             (with-meta m)
             (empty))]
    (t/is (= m (meta db)))))

#?(:clj
   (deftest ^{:doc "Can't pprint filtered db"}
     issue-330
     (let [base     (-> (ds/empty-db {:aka {:db/cardinality :db.cardinality/many}})
                      (ds/db-with [{:db/id -1
                                    :name  "Maksim"
                                    :age   45
                                    :aka   ["Max Otto von Stierlitz", "Jack Ryan"]}]))
           filtered (ds/filter base (constantly true))]
       (t/is (= (with-out-str (clojure.pprint/pprint base))
               (with-out-str (clojure.pprint/pprint filtered)))))))

(deftest ^{:doc "Can't diff databases with different types of the same attribute"}
  issue-369
  (let [db1 (-> (ds/empty-db)
              (ds/db-with [[:db/add 1 :attr :aa]]))
        db2 (-> (ds/empty-db)
              (ds/db-with [[:db/add 1 :attr "aa"]]))]
    (t/is (= [[(ds/datom 1 :attr :aa)] [(ds/datom 1 :attr "aa")] nil]
            (clojure.data/diff db1 db2)))))

(deftest ^{:doc "Expose a schema as a part of the public API."}
  issue-381
  (let [schema {:aka {:db/cardinality :db.cardinality/many}}
        db     (ds/empty-db schema)]
    (t/is (= schema (ds/schema db)))))

(deftest ^{:doc "Transient indices might lead to data corruption.
                 Transacting against a db must not corrupt older db values:
                 transient conj!/disj! during transact used to mutate index
                 tree nodes shared with the persistent base db"}
  issue-373
  (let [schema {:vs {:db/cardinality :db.cardinality/many}}
        evens  (range 0 8192 2)
        db0    (ds/db-with (ds/empty-db schema)
                 [{:db/id 1 :vs (vec evens)}])
        _      (ds/db-with db0
                 (concat
                   ;; inserts in the middle of shared index trees
                   (for [v (range 1 2048 2)]
                     [:db/add 1 :vs v])
                   ;; removals of datoms belonging to db0
                   (for [v (range 0 2048 2)]
                     [:db/retract 1 :vs v])
                   (for [v (range 4096 6144)]
                     [:db/add 1 :vs v])))]
    ;; db0 must stay intact: iteration order...
    (t/is (= evens (map :v (ds/datoms db0 :eavt))))
    (t/is (= evens (map :v (ds/datoms db0 :aevt))))
    ;; ...and searches (broken separator keys send lookups into wrong subtree)
    (t/is (every? #(= % (:v (first (ds/datoms db0 :eavt 1 :vs %)))) evens))
    (t/is (every? #(= % (:v (first (ds/datoms db0 :aevt :vs 1 %)))) evens))))

(deftest ^{:doc "issue-373 was originally reported on entities with
                 :db.unique/identity attributes: check that transacting
                 does not corrupt the AVET index of older db values"}
  issue-373-avet
  (let [schema {:login {:db/unique :db.unique/identity}}
        evens  (range 0 8192 2)
        db0    (ds/db-with (ds/empty-db schema)
                 (for [v evens]
                   {:db/id (inc (quot v 2)) :login v}))
        _      (ds/db-with db0
                 (concat
                   ;; new entities whose values land in the middle of db0’s avet tree
                   (for [v (range 1 2048 2)]
                     {:login v})
                   ;; retractions of datoms belonging to db0
                   (for [v (range 0 2048 2)]
                     [:db/retract (inc (quot v 2)) :login v])
                   (for [v (range 8193 12288 2)]
                     {:login v})))]
    (t/is (= evens (map :v (ds/datoms db0 :avet :login))))
    ;; lookup refs resolve through avet, same path upserts take
    (t/is (every? #(= (inc (quot % 2)) (ds/entid db0 [:login %])) evens))))

(deftest ^{:doc "issue-373, suspected cause: transaction restart after upsert
                 conflict (retry-with-tempid) abandons a transient session
                 mid-flight. Neither the base db nor the restarted transaction
                 should be affected by the abandoned edits"}
  issue-373-upsert-retry
  (let [schema {:name {:db/unique :db.unique/identity}
                :vs   {:db/cardinality :db.cardinality/many}}
        evens  (range 0 8192 2)
        db0    (ds/db-with (ds/empty-db schema)
                 (concat
                   [{:db/id 1 :name "target"}]
                   (for [v evens]
                     [:db/add 2 :vs v])))
        report (ds/with db0
                 (concat
                   ;; make the transient session edit trees shared with db0...
                   (for [v (range 1 2048 2)]
                     [:db/add 2 :vs v])
                   (for [v (range 0 2048 2)]
                     [:db/retract 2 :vs v])
                   ;; ...then allocate a tempid and upsert it to an existing
                   ;; entity, forcing a restart from the beginning
                   [[:db/add -1 :age 37]
                    [:db/add -1 :name "target"]]))
        db1    (:db-after report)]
    ;; retry resolved tempid to the upserted entity
    (t/is (= 1 (get-in report [:tempids -1])))
    (t/is (= 37 (:age (ds/entity db1 1))))
    ;; no leftover datoms from the abandoned first attempt
    (t/is (= [1] (map :e (ds/datoms db1 :aevt :age))))
    (t/is (= (concat (range 1 2048 2) (range 2048 8192 2))
            (map :v (ds/datoms db1 :eavt 2 :vs))))
    ;; base db not corrupted by the abandoned transient session
    (t/is (= evens (map :v (ds/datoms db0 :eavt 2 :vs))))
    (t/is (every? #(= % (:v (first (ds/datoms db0 :eavt 2 :vs %)))) evens))
    (t/is (= 1 (ds/entid db0 [:name "target"])))))

(deftest ^{:doc "issue-373, reported scenario: corruption appeared in db values
                 several transactions back. Chain transactions and verify every
                 intermediate db against a snapshot taken right after its tx"}
  issue-373-history-chain
  (let [schema    {:name {:db/unique :db.unique/identity}
                   :vs   {:db/cardinality :db.cardinality/many}}
        db0       (ds/db-with (ds/empty-db schema)
                    (cons {:db/id 1 :name "n0"}
                      (for [v (range 0 8192 2)]
                        [:db/add 1 :vs v])))
        snapshot  (fn [db]
                    {:db     db
                     :datoms (mapv (juxt :e :a :v) (ds/datoms db :eavt))
                     :vs     (mapv :v (ds/datoms db :eavt 1 :vs))})
        snapshots (reduce
                    (fn [snapshots k]
                      ;; each tx flips values 0..4095 to the opposite parity:
                      ;; inserts and retractions all over the shared trees
                      (let [[add remove] (if (odd? k)
                                           [(range 1 4096 2) (range 0 4096 2)]
                                           [(range 0 4096 2) (range 1 4096 2)])
                            ;; the entity map goes last: its datoms append at the
                            ;; rightmost edge of the indexes, and an append as the
                            ;; first op would path-copy the root before the middle
                            ;; inserts get a chance to alias its arrays
                            db' (ds/db-with (:db (peek snapshots))
                                  (concat
                                    (for [v add]    [:db/add 1 :vs v])
                                    (for [v remove] [:db/retract 1 :vs v])
                                    [{:name (str "n" k) :age k}]))]
                        (conj snapshots (snapshot db'))))
                    [(snapshot db0)]
                    (range 1 9))]
    (doseq [[k {:keys [db datoms vs]}] (map vector (range) snapshots)]
      ;; each historical db still equals its own snapshot: iteration...
      (t/is (= datoms (mapv (juxt :e :a :v) (ds/datoms db :eavt))) (str "eavt after tx " k))
      ;; ...and searches
      (t/is (every? #(= % (:v (first (ds/datoms db :eavt 1 :vs %)))) vs) (str "lookups after tx " k))
      ;; entities reachable and complete, as in the original report
      (doseq [j (range 1 (inc k))]
        (t/is (= j (:age (ds/entity db [:name (str "n" j)]))) (str "entity n" j " after tx " k))))))
