var _ = require("./underscore-1.6.0.min.js");

var passed = 0, failures = 0, asserts = 0, errors = 0;

function eq_set(s1, s2) {
  return _.every(s1, function(e1) { return _.find(s2, function(e2) { return _.isEqual(e1, e2); }) != undefined })
      && _.every(s2, function(e2) { return _.find(s1, function(e1) { return _.isEqual(e1, e2); }) != undefined });
}

function maybe_to_datom(d) {
  if (Array.isArray(d))
    return {"e": d[0], "a": d[1], "v": d[2], "tx": d[3] > 0 ? d[3] : -d[3]};
  else
    return d;
}

function cmp_datoms(d1, d2) {
  if (d1 == null) return d2 == null;
  if (d2 == null) return false;
  d1 = maybe_to_datom(d1);
  d2 = maybe_to_datom(d2);
  return d1.e == d2.e && d1.a == d2.a && _.isEqual(d1.v, d2.v) && d1.tx == d2.tx && d1.added == d2.added;
}

function assert_eq_datoms(expected, got, message) {
  asserts++;
  if(! _.every(_.zip(expected, got), function(dd) { return cmp_datoms(dd[0], dd[1]); }) ) {
    errors--;
    failures++;
    throw (message || "Assertion failed") + ": expected: " + JSON.stringify(expected) + ", got: " + JSON.stringify(got);
  }
}

function assert_eq(expected, got, message) {
  asserts++;
  if (!_.isEqual(expected, got)) {
    errors--;
    failures++;
    throw (message || "Assertion failed") + ": expected: " + JSON.stringify(expected) + ", got: " + JSON.stringify(got);
  }
}

function assert_ident(expected, got, message) {
  asserts++;
  if (expected !== got) {
    errors--;
    failures++;
    throw (message || "Assertion failed") + ": expected: " + JSON.stringify(expected) + ", got: " + JSON.stringify(got);
  }
}

function assert_eq_set(expected, got, message) {
  asserts++;
  if (!eq_set(expected, got)) {
    errors--;
    failures++;
    throw (message || "Assertion failed") + ": expected: " + JSON.stringify(expected) + ", got: " + JSON.stringify(got);
  }
}

function assert_throws(expected_msg, fn, message) {
  asserts++;
  var thrown = null;
  try {
    fn();
  } catch (e) {
    thrown = (e && e.message) || String(e);
  }
  if (thrown == null) {
    errors--;
    failures++;
    throw (message || "Assertion failed") + ": expected error " + JSON.stringify(expected_msg) + ", got no error";
  }
  if (thrown.indexOf(expected_msg) < 0) {
    errors--;
    failures++;
    throw (message || "Assertion failed") + ": expected error " + JSON.stringify(expected_msg) + ", got: " + JSON.stringify(thrown);
  }
}

function assert_eq_refs(expected, got, message) {
  var got_ids = _.map(got, function(e) { return e.get(":db/id"); });
  assert_eq_set(expected, got_ids);
}

function assert_eq_iter_set(expected, got, message) {
  var got_arr = [];
  // ECMAScript 6 iterators
  // for (let v of got) { 
  //   got_arr.push(v);
  // }
  var i = got.next();
  while (!i.done) {
    got_arr.push(i.value);
    i = got.next();
  }
  assert_eq_set(expected, got_arr, message);
}

function test_fns(fns) {
  for(var i in fns) {
    try {
      fns[i]();
      passed++;
      console.log("[ OK ] " + fns[i].name);
    } catch(e) {
      console.error(fns[i].name + ":", e);
      errors++;
      console.error("[ FAIL ] " + fns[i].name);
    }
  }
  
  console.log("Ran " + fns.length + " tests containing " + asserts + " assertions.");
  console.log("Testing complete: " + failures + " failures, " + errors + " errors."); 
  
  return { fail:  failures,
           error: errors,
           test:  fns.length,
           pass:  asserts - failures - errors };
}


///--------- TESTS ---------


var d = require("../../release-js/datascript.js");
var tx0 = 0x20000000; // we just know it, alright?

function test_db_with() {
  var db = d.empty_db();
  var db1 = d.db_with(db, [[":db/add", 1, "name", "Ivan"],
                           [":db/add", 1, "age", 17]]);
  var db2 = d.db_with(db1, [{":db/id": 2,
                             "name": "Igor",
                             "age": 35}]);
  var q = '[:find ?n ?a :where [?e "name" ?n] [?e "age" ?a]]'; 
  assert_eq_set([["Ivan", 17]], d.q(q, db1));
  assert_eq_set([["Ivan", 17], ["Igor", 35]], d.q(q, db2));
}

function test_nested_maps() {
  var q = '[:find ?e ?a ?v :where [?e ?a ?v]]';
  
  var db0 = d.empty_db({"profile": {":db/valueType": ":db.type/ref"},
                        "friend": {":db/valueType": ":db.type/ref",
                                   ":db/cardinality": ":db.cardinality/many"}});
  var db = d.db_with(db0, [{"name": "Igor", "profile": {"email": "@2"} }]);
  assert_eq_set([[1, "name", "Igor"], [1, "profile", 2], [2, "email", "@2"]], d.q(q, db));

  db = d.db_with(db0, [{":db/id": 1, "name": "Igor"},
                       {":db/id": 2, "name": "Oleg", "profile": {":db/id": 1}}]);
  assert_eq_set([[1, "name", "Igor"], [2, "name", "Oleg"], [2, "profile", 1]], d.q(q, db));

  db = d.db_with(db0, [{":db/id": 1, "name": "Igor"},
                       {":db/id": 2, "name": "Ivan"},
                       {":db/id": 3, "name": "Oleg", "friend": [{":db/id": 1}, {":db/id": 2}]}]);
  assert_eq_set([[1, "name", "Igor"], [2, "name", "Ivan"], [3, "friend", 1], [3, "friend", 2], [3, "name", "Oleg"]], d.q(q, db));
  
  db = d.db_with(db0, [{"email": "@2", "_profile": {"name": "Igor"}}]);
  assert_eq_set([[1, "email", "@2"], [2, "name", "Igor"], [2, "profile", 1]], d.q(q, db));
  
  db0 = d.empty_db({"user/profile": {":db/valueType": ":db.type/ref"}});
  db = d.db_with(db0, [{"name": "Igor", "user/profile": {"email": "@2"} }]);
  assert_eq_set([[1, "name", "Igor"], [1, "user/profile", 2], [2, "email", "@2"]], d.q(q, db));
  
  db = d.db_with(db0, [{"email": "@2", "user/_profile": {"name": "Igor"}}]);
  assert_eq_set([[1, "email", "@2"], [2, "name", "Igor"], [2, "user/profile", 1]], d.q(q, db));
}

function test_init_db() {
  var q = '[:find ?n ?a ?tx :where [?e "name" ?n ?tx] [?e "age" ?a]]'; 
  var db_ok = function(db) {
    assert_eq_set([["Ivan", 17, tx0],
                   ["Igor", 35, tx0+1]],
                  d.q(q, db));
  };
  db_ok(d.init_db([[1, "name", "Ivan"],
                   [1, "age", 17],
                   [2, "name", "Igor", tx0+1],
                   [2, "age", 35, tx0+1]]));
  db_ok(d.init_db([{e: 1, a: "name", v: "Ivan"},
                   {e: 1, a: "age", v: 17},
                   {e: 2, a: "name", v: "Igor", tx: tx0+1},
                   {e: 2, a: "age", v: 35, tx: tx0+1}]));
  var db = d.init_db([[1, "aka", "X"],
                      [1, "aka", "Y"]],
                     {"aka": {":db/cardinality": ":db.cardinality/many"}});
  assert_eq_set(["X", "Y"], d.q('[:find [?aka ...] :where [_ "aka" ?aka]]', db));
}

function test_dbfn_call() {
  var dbfn = function(db, e, n, a) { 
    return [[":db/add", e, "name", n],
            [":db/add", e, "age", a]]; 
  }
  var db = d.db_with(d.empty_db(), [[":db.fn/call", dbfn, 1, "Ilya", 44]]);
  var q = '[:find ?n ?a :where [?e "name" ?n] [?e "age" ?a]]'; 
  assert_eq_set([["Ilya", 44]], d.q(q, db));
}

function test_schema() {
  var schema = {"aka": {":db/cardinality": ":db.cardinality/many"}};
  var db = d.db_with(d.empty_db(schema), 
                         [[":db/add", -1, "name", "Ivan"],
                          [":db/add", -1, "aka", "X"],
                          [":db/add", -1, "aka", "Y"],
                          {":db/id": -2,
                           "name": "Igor",
                           "aka": ["F", "G"]}]);
  var q = '[:find ?aka :in $ ?e :where [?e "aka" ?aka]]'; 
  assert_eq_set([["X"], ["Y"]], d.q(q, db, 1));
  assert_eq_set([["F"], ["G"]], d.q(q, db, 2));
}

function test_tuple() {
  var schema = {"a+b+c": {":db/tupleAttrs": ["a", "b", "c"]}};
  var db = d.db_with(d.empty_db(schema), 
                         [[":db/add", 1, "a", "A"],
                          [":db/add", 1, "b", "B"],
                          [":db/add", 1, "c", "C"]]);
  var q = '[:find ?e ?a+b+c :in $ :where [?e "a+b+c" ?a+b+c]]';
  assert_eq_set([[1, ["A", "B", "C"]]], d.q(q, db));
}

function eids(datoms) {
  return _.map(datoms, function(d) { return d.e; });
}

var hetero_schema = {"loc": {":db/valueType": ":db.type/tuple",
                             ":db/tupleTypes": [":db.type/long", ":db.type/long"]}};

var homo_schema = {"kws": {":db/valueType": ":db.type/tuple",
                           ":db/tupleType": ":db.type/keyword"}};

var tuple_ref_schema = {"name":     {":db/unique": ":db.unique/identity"},
                        "ref+long": {":db/valueType": ":db.type/tuple",
                                     ":db/tupleTypes": [":db.type/ref", ":db.type/long"]}};

function test_hetero_tuple() {
  var q = '[:find ?loc . :in $ ?e :where [?e "loc" ?loc]]';
  var conn = d.create_conn(hetero_schema);

  // vector form
  d.transact(conn, [[":db/add", 1, "loc", [100, 0]]]);
  assert_eq([100, 0], d.q(q, d.db(conn), 1));

  // map form
  d.transact(conn, [{":db/id": 1, "loc": [100, 200]}]);
  assert_eq([100, 200], d.q(q, d.db(conn), 1));

  // pull
  assert_eq({"loc": [100, 200]}, d.pull(d.db(conn), '["loc"]', 1));
  assert_eq({":db/id": 1, "loc": [100, 200]}, d.pull(d.db(conn), '[*]', 1));

  // null is a legal value in any slot
  d.transact(conn, [[":db/add", 1, "loc", [100, null]]]);
  assert_eq([100, null], d.q(q, d.db(conn), 1));

  // retract by value
  d.transact(conn, [[":db/retract", 1, "loc", [100, null]]]);
  assert_eq(null, d.q(q, d.db(conn), 1));

  // init_db
  var db = d.init_db([[1, "loc", [100, 0]],
                      [2, "loc", [200, 0]]],
                     hetero_schema);
  assert_eq_set([[1, [100, 0]], [2, [200, 0]]],
                d.q('[:find ?e ?loc :where [?e "loc" ?loc]]', db));

  // arity is validated
  assert_throws('Attribute "loc" expected a 2-element vector, got: [1 2 3]',
    function() { d.transact(conn, [[":db/add", 1, "loc", [1, 2, 3]]]); });
  assert_throws('Attribute "loc" expected a 2-element vector, got: "blah"',
    function() { d.transact(conn, [[":db/add", 1, "loc", "blah"]]); });
  assert_throws('Attribute "loc" expected a 2-element vector, got: [1 2 3]',
    function() { d.transact(conn, [[":db/retract", 1, "loc", [1, 2, 3]]]); });
}

function test_homo_tuple() {
  var q = '[:find ?kws . :in $ ?e :where [?e "kws" ?kws]]';
  var conn = d.create_conn(homo_schema);

  d.transact(conn, [[":db/add", 1, "kws", [":a", ":b"]]]);
  assert_eq([":a", ":b"], d.q(q, d.db(conn), 1));
  assert_eq({"kws": [":a", ":b"]}, d.pull(d.db(conn), '["kws"]', 1));

  // length is not fixed
  d.transact(conn, [[":db/add", 1, "kws", [":a", ":b", ":c"]]]);
  assert_eq([":a", ":b", ":c"], d.q(q, d.db(conn), 1));

  var db = d.db_with(d.empty_db({"xs": {":db/valueType": ":db.type/tuple",
                                        ":db/tupleType": ":db.type/long"}}),
                     [[":db/add", 1, "xs", [1, 2, 3]],
                      [":db/add", 2, "xs", [4]]]);
  assert_eq_set([[1, [1, 2, 3]], [2, [4]]],
                d.q('[:find ?e ?xs :where [?e "xs" ?xs]]', db));

  // still has to be a vector
  assert_throws('Attribute "kws" expected a vector, got: ":a"',
    function() { d.transact(conn, [[":db/add", 1, "kws", ":a"]]); });
}

function test_tuple_schema_errors() {
  assert_throws('"t" :db/tupleTypes must be a sequential collection of at least 2 keywords, got: [:db.type/long]',
    function() { d.empty_db({"t": {":db/valueType": ":db.type/tuple",
                                   ":db/tupleTypes": [":db.type/long"]}}); });

  assert_throws('"t" :db/tupleType must be a keyword, got: [:db.type/long]',
    function() { d.empty_db({"t": {":db/valueType": ":db.type/tuple",
                                   ":db/tupleType": [":db.type/long"]}}); });

  assert_throws('Bad attribute specification for "t": {:db/valueType :db.type/tuple} should also have :db/tupleAttrs, :db/tupleTypes or :db/tupleType',
    function() { d.empty_db({"t": {":db/valueType": ":db.type/tuple"}}); });

  assert_throws('Bad attribute specification for "t": only one of :db/tupleAttrs, :db/tupleTypes, :db/tupleType is allowed, got [:db/tupleAttrs :db/tupleTypes]',
    function() { d.empty_db({"t": {":db/tupleAttrs": ["a", "b"],
                                   ":db/tupleTypes": [":db.type/long", ":db.type/long"]}}); });
}

function test_tuple_refs() {
  var q = '[:find ?v . :in $ ?e :where [?e "ref+long" ?v]]';
  var db = d.db_with(d.empty_db(tuple_ref_schema),
                     [{":db/id": 1, "name": "Ivan"},
                      {":db/id": 2, "name": "Oleg"}]);

  // entity id in ref slot
  assert_eq([1, 7], d.q(q, d.db_with(db, [[":db/add", 2, "ref+long", [1, 7]]]), 2));

  // lookup ref in ref slot
  assert_eq([1, 7], d.q(q, d.db_with(db, [[":db/add", 2, "ref+long", [["name", "Ivan"], 7]]]), 2));
  assert_eq([1, 7], d.q(q, d.db_with(db, [{":db/id": 2, "ref+long": [["name", "Ivan"], 7]}]), 2));

  // tempid in ref slot
  var conn = d.create_conn(tuple_ref_schema);
  var report = d.transact(conn, [{":db/id": -1, "name": "Ivan"},
                                 [":db/add", 2, "ref+long", [-1, 7]]]);
  assert_eq([d.resolve_tempid(report.tempids, -1), 7], d.q(q, d.db(conn), 2));

  // ":db/current-tx" in ref slot
  conn = d.create_conn(tuple_ref_schema);
  report = d.transact(conn, [[":db/add", 1, "ref+long", [":db/current-tx", 7]]]);
  assert_eq([tx0+1, 7], d.q(q, d.db(conn), 1));

  // retract by value with lookup ref in ref slot
  var db1 = d.db_with(db, [[":db/add", 2, "ref+long", [1, 7]]]);
  assert_eq(null, d.q(q, d.db_with(db1, [[":db/retract", 2, "ref+long", [["name", "Ivan"], 7]]]), 2));

  // tempid that is only used inside a tuple is not enough to create an entity
  assert_throws("Tempids used only as value in transaction: (-5)",
    function() { d.db_with(db, [[":db/add", 2, "ref+long", [-5, 7]]]); });

  // non-ref slots are left alone
  var db2 = d.db_with(d.empty_db({"name":     {":db/unique": ":db.unique/identity"},
                                  "long+ref": {":db/valueType": ":db.type/tuple",
                                               ":db/tupleTypes": [":db.type/long", ":db.type/ref"]}}),
                      [{":db/id": 1, "name": "Ivan"},
                       [":db/add", 1, "long+ref", [7, ["name", "Ivan"]]]]);
  assert_eq([7, 1], d.q('[:find ?v . :where [1 "long+ref" ?v]]', db2));

  // homogeneous tuple of refs resolves every slot
  var db3 = d.db_with(d.empty_db({"name": {":db/unique": ":db.unique/identity"},
                                  "refs": {":db/valueType": ":db.type/tuple",
                                           ":db/tupleType": ":db.type/ref"}}),
                      [{":db/id": 1, "name": "Ivan"},
                       {":db/id": 2, "name": "Oleg"}]);
  db3 = d.db_with(db3, [[":db/add", 1, "refs", [["name", "Ivan"], ["name", "Oleg"]]]]);
  assert_eq([1, 2], d.q('[:find ?v . :where [1 "refs" ?v]]', db3));
}

var unique_tuple_schema = {"name":     {":db/unique": ":db.unique/identity"},
                           "ref+long": {":db/valueType": ":db.type/tuple",
                                        ":db/tupleTypes": [":db.type/ref", ":db.type/long"],
                                        ":db/unique": ":db.unique/identity"}};

function test_tuple_unique() {
  var conn = d.create_conn(unique_tuple_schema);
  d.transact(conn, [{":db/id": 1, "name": "Ivan"},
                    {":db/id": 2, "name": "Oleg", "ref+long": [1, 7]}]);

  // upsert by tuple
  d.transact(conn, [{"ref+long": [1, 7], "age": 30}]);
  assert_eq({":db/id": 2, "name": "Oleg", "ref+long": [1, 7], "age": 30},
            d.pull(d.db(conn), '[*]', 2));

  // upsert by tuple with lookup ref inside
  d.transact(conn, [{"ref+long": [["name", "Ivan"], 7], "age": 31}]);
  assert_eq(31, d.q('[:find ?age . :where [2 "age" ?age]]', d.db(conn)));

  // tuple as a lookup ref
  assert_eq("Oleg", d.entity(d.db(conn), ["ref+long", [1, 7]]).get("name"));
  assert_eq("Oleg", d.entity(d.db(conn), ["ref+long", [["name", "Ivan"], 7]]).get("name"));
  assert_eq({"name": "Oleg"}, d.pull(d.db(conn), '["name"]', ["ref+long", [1, 7]]));
  assert_eq_set([{"name": "Oleg"}], d.pull_many(d.db(conn), '["name"]', [["ref+long", [1, 7]]]));
  assert_eq([2], eids(d.datoms(d.db(conn), ":eavt", ["ref+long", [1, 7]], "name")));

  d.transact(conn, [[":db/add", ["ref+long", [["name", "Ivan"], 7]], "age", 32]]);
  assert_eq(32, d.q('[:find ?age . :where [2 "age" ?age]]', d.db(conn)));

  // uniqueness is enforced
  assert_throws('Cannot add #datascript/Datom [3 "ref+long" [1 7]',
    function() { d.transact(conn, [[":db/add", 3, "ref+long", [1, 7]]]); });

  // conflicting upserts
  d.transact(conn, [{":db/id": 3, "name": "Petr", "ref+long": [1, 8]}]);
  assert_throws('Conflicting upserts: ["name" "Oleg"] resolves to 2, but ["ref+long" [1 8]] resolves to 3',
    function() { d.transact(conn, [{"name": "Oleg", "ref+long": [1, 8]}]); });
}

function test_tuple_index() {
  var tx = [[":db/add", 1, "loc", [100, 0]],
            [":db/add", 2, "loc", [100, 200]],
            [":db/add", 3, "loc", [200, 0]]];

  // not indexed by default
  var db = d.db_with(d.empty_db(hetero_schema), tx);
  assert_throws('Attribute "loc" should be marked as :db/index true',
    function() { d.datoms(db, ":avet", "loc"); });

  var indexed_schema = {"loc": {":db/valueType": ":db.type/tuple",
                                ":db/tupleTypes": [":db.type/long", ":db.type/long"],
                                ":db/index": true}};
  db = d.db_with(d.empty_db(indexed_schema), tx);
  assert_eq([1, 2, 3], eids(d.datoms(db, ":avet", "loc")));
  assert_eq([1],       eids(d.datoms(db, ":avet", "loc", [100, 0])));
  assert_eq([2, 3],    eids(d.seek_datoms(db, ":avet", "loc", [100, 200])));
  assert_eq([1, 2],    eids(d.index_range(db, "loc", [100, 0], [100, 200])));
  assert_eq([1],       eids(d.datoms(db, ":eavt", 1, "loc", [100, 0])));

  // homogeneous tuples sort by length first
  db = d.db_with(d.empty_db({"xs": {":db/valueType": ":db.type/tuple",
                                    ":db/tupleType": ":db.type/long",
                                    ":db/index": true}}),
                 [[":db/add", 1, "xs", [1, 3]],
                  [":db/add", 2, "xs", [1, 2, 3]],
                  [":db/add", 3, "xs", [1, 2]]]);
  assert_eq([3, 1, 2], eids(d.datoms(db, ":avet", "xs")));
}

function test_tuple_read_refs() {
  var schema = {"name":     {":db/unique": ":db.unique/identity"},
                "ref+long": {":db/valueType": ":db.type/tuple",
                             ":db/tupleTypes": [":db.type/ref", ":db.type/long"],
                             ":db/index": true},
                "refs":     {":db/valueType": ":db.type/tuple",
                             ":db/tupleType": ":db.type/ref",
                             ":db/index": true}};
  var db = d.db_with(d.empty_db(schema),
                     [{":db/id": 1, "name": "Ivan"},
                      {":db/id": 2, "name": "Oleg"},
                      [":db/add", 2, "ref+long", [1, 7]],
                      [":db/add", 2, "refs", [1, 2]]]);

  // lookup refs in ref slots are resolved on read, too
  assert_eq([2], eids(d.datoms(db, ":avet", "ref+long", [["name", "Ivan"], 7])));
  assert_eq([2], eids(d.datoms(db, ":eavt", 2, "ref+long", [["name", "Ivan"], 7])));
  assert_eq(2,   eids(d.seek_datoms(db, ":avet", "ref+long", [["name", "Ivan"], 7]))[0]);
  assert_eq([2], eids(d.index_range(db, "ref+long", [["name", "Ivan"], 7], [["name", "Ivan"], 8])));
  assert_eq([2], eids(d.datoms(db, ":avet", "refs", [["name", "Ivan"], ["name", "Oleg"]])));

  // and in queries
  assert_eq_set([[2]], d.q('[:find ?e :where [?e "ref+long" [["name" "Ivan"] 7]]]', db));
  assert_eq_set([[2]], d.q('[:find ?e :where [?e "refs" [["name" "Ivan"] ["name" "Oleg"]]]]', db));

  // unresolved refs raise
  assert_throws('Nothing found for entity id ["name" "Petr"]',
    function() { d.datoms(db, ":avet", "ref+long", [["name", "Petr"], 7]); });
}

function test_tuple_many() {
  var schema = {"locs": {":db/valueType": ":db.type/tuple",
                         ":db/tupleTypes": [":db.type/long", ":db.type/long"],
                         ":db/cardinality": ":db.cardinality/many"}};
  var q = '[:find ?e ?locs :where [?e "locs" ?locs]]';

  var db = d.db_with(d.empty_db(schema), [[":db/add", 1, "locs", [100, 0]],
                                          [":db/add", 1, "locs", [200, 0]]]);
  assert_eq_set([[1, [100, 0]], [1, [200, 0]]], d.q(q, db));

  // in map form, several tuples have to be wrapped in an extra array,
  // otherwise a single tuple is read as a collection of values
  db = d.db_with(d.empty_db(schema), [{":db/id": 1, "locs": [[300, 0], [400, 0]]}]);
  assert_eq_set([[1, [300, 0]], [1, [400, 0]]], d.q(q, db));

  db = d.db_with(db, [[":db/retract", 1, "locs", [300, 0]]]);
  assert_eq_set([[1, [400, 0]]], d.q(q, db));
}

function test_tuple_cas() {
  var q = '[:find ?v . :in $ ?e :where [?e "ref+long" ?v]]';
  var conn = d.create_conn(tuple_ref_schema);
  d.transact(conn, [{":db/id": 1, "name": "Ivan"},
                    [":db/add", 2, "ref+long", [1, 7]]]);

  d.transact(conn, [[":db.fn/cas", 2, "ref+long", [["name", "Ivan"], 7], [["name", "Ivan"], 8]]]);
  assert_eq([1, 8], d.q(q, d.db(conn), 2));

  assert_throws(':db.fn/cas failed on datom [2 "ref+long" [1 8]], expected [1 7]',
    function() { d.transact(conn, [[":db.fn/cas", 2, "ref+long", [1, 7], [1, 9]]]); });

  // set-if-absent
  d.transact(conn, [[":db.fn/cas", 3, "ref+long", null, [["name", "Ivan"], 5]]]);
  assert_eq([1, 5], d.q(q, d.db(conn), 3));

  assert_throws('Attribute "ref+long" expected a 2-element vector, got: [1 8 9]',
    function() { d.transact(conn, [[":db.fn/cas", 2, "ref+long", [1, 8, 9], [1, 9]]]); });
}

function test_tuple_serialize() {
  var schema = {"name": {":db/unique": ":db.unique/identity"},
                "loc":  {":db/valueType": ":db.type/tuple",
                         ":db/tupleTypes": [":db.type/long", ":db.type/long"]},
                "kws":  {":db/valueType": ":db.type/tuple",
                         ":db/tupleType": ":db.type/keyword"},
                "refs": {":db/valueType": ":db.type/tuple",
                         ":db/tupleType": ":db.type/ref"}};
  var db = d.db_with(d.empty_db(schema),
                     [{":db/id": 1, "name": "Ivan", "loc": [100, null], "kws": [":a", ":b"]},
                      {":db/id": 2, "name": "Oleg", "refs": [1, 1]}]);
  var db2 = d.from_serializable(JSON.parse(JSON.stringify(d.serializable(db))));

  var q = '[:find ?e ?a ?v :where [?e ?a ?v]]';
  var expected = [[1, "name", "Ivan"],
                  [1, "loc",  [100, null]],
                  [1, "kws",  [":a", ":b"]],
                  [2, "name", "Oleg"],
                  [2, "refs", [1, 1]]];
  assert_eq_set(expected, d.q(q, db));
  assert_eq_set(expected, d.q(q, db2));

  // schema survives, tuples are still validated after a round-trip
  assert_throws('Attribute "loc" expected a 2-element vector, got: [1 2 3]',
    function() { d.db_with(db2, [[":db/add", 1, "loc", [1, 2, 3]]]); });
}

function test_tx_report() {
  var conn = d.create_conn();
  var log = [];
  var meta = [];
  d.listen(conn, function(report) { log.push(report.tx_data); 
                                    meta.push(report.tx_meta); });
  var tx_report = d.transact(conn, [[":db/add", -1, "name", "Ivan"],
                                    [":db/add", -1, "age", 17]], {"some-meta": 1});
  assert_eq_datoms([[1, "name", "Ivan", tx0+1],
                    [1, "age", 17, tx0+1]],
                   tx_report.tx_data);
  assert_eq({"-1": 1, ":db/current-tx": tx0+1}, tx_report.tempids);
  assert_eq(1, d.resolve_tempid(tx_report.tempids, -1));
  assert_eq(tx0+1, d.resolve_tempid(tx_report.tempids, ":db/current-tx"));
  assert_eq_datoms([[1, "name", "Ivan", tx0+1],
                    [1, "age", 17, tx0+1]],
                    log[0]);
  assert_eq(tx_report.tx_meta, {"some-meta": 1});
  assert_eq(meta[0], {"some-meta": 1});
}

function test_conn() {
  var datoms = [[1, "age",  17, tx0+1],
                [1, "name", "Ivan", tx0+1]];
  var conn = d.conn_from_datoms(datoms);
  assert_eq_datoms(datoms, d.datoms(d.db(conn), ":eavt"));
  
  conn = d.conn_from_db(d.init_db(datoms));
  assert_eq_datoms(datoms, d.datoms(d.db(conn), ":eavt"));
  
  var datoms2 = [[1, "age",  20, tx0+1],
                 [1, "sex", "male", tx0+1]];
  d.reset_conn(conn, d.init_db(datoms2));
  assert_eq_datoms(datoms2, d.datoms(d.db(conn), ":eavt"));
}

function test_entity() {
  var schema = {"aka": {":db/cardinality": ":db.cardinality/many"}};
  var db = d.db_with(d.empty_db(schema), 
                         [{":db/id": 1,
                           "name": "Ivan",
                           "aka": ["X", "Y"]},
                          {":db/id": 2}]);
  var e = d.entity(db, 1);
  assert_eq("Ivan",     e.get("name"));
  assert_eq(["X", "Y"], e.get("aka"));
  assert_eq(1,          e.get(":db/id"));
  
  assert_ident(db, e.db);
  
  var e2 = d.entity(db, 2);
  assert_eq(null, e2);

  // js interop
  assert_eq_set(["name", "aka"], e.key_set());
  assert_eq_set(["Ivan", ["X", "Y"]], e.value_set());
  assert_eq_set([["name", "Ivan"], ["aka", ["X", "Y"]]], e.entry_set());
  
  var foreach = [];
  e.forEach(function(v, a) { foreach.push([a,v]); });
  assert_eq_set([["name", "Ivan"], ["aka", ["X", "Y"]]], foreach);
  
  foreach = [];
  e.forEach(function(v, a) { this.push([a,v]); }, foreach);
  assert_eq_set([["name", "Ivan"], ["aka", ["X", "Y"]]], foreach);
  
  // js/map interfaces
  assert_eq_iter_set(["name", "aka"], e.keys());
  assert_eq_iter_set(["Ivan", ["X", "Y"]], e.values());
  assert_eq_iter_set([["name", "Ivan"], ["aka", ["X", "Y"]]], e.entries());
}

function test_entity_refs() {
  var schema = {"father":   {":db/valueType":   ":db.type/ref"},
                "children": {":db/valueType":   ":db.type/ref",
                             ":db/cardinality": ":db.cardinality/many"}};
  var db = d.db_with(d.empty_db(schema), 
                         [{":db/id": 1,   "children": [10]},
                          {":db/id": 10,  "father":   1, "children": [100, 101]},
                          {":db/id": 100, "father":   10},
                          {":db/id": 101, "father":   10}]);
  
  var e = function(id) { return d.entity(db, id); };
  assert_eq_refs([10], e(1).get("children"));
  assert_eq_refs([101, 100], e(10).get("children"));
  
  // empty attribute
  assert_eq(null, e(100).get("children"));
  
  // nested navigation
  assert_eq_refs([100, 101], e(1).get("children")[0].get("children"));
  assert_eq     (10,         e(10).get("children")[0].get("father").get(":db/id"));
  assert_eq_refs([10],       e(10).get("father").get("children"));
  
  // backward navigation
  assert_eq     (null,       e(1).get("_children"));
  assert_eq_refs([10],       e(1).get("_father"));
  assert_eq_refs([1],        e(10).get("_children"));
  assert_eq_refs([100, 101], e(10).get("_father"));
  assert_eq_refs([1],        e(100).get("_children")[0].get("_children"));
}

function test_entity_iterators() {
  var schema = {"aka": {":db/cardinality": ":db.cardinality/many"}};
  var db = d.db_with(d.empty_db(schema),
                         [{":db/id": 1,
                           "name": "Ivan",
                           "aka": ["X", "Y"]},
                          {":db/id": 2}]);
  var e = d.entity(db, 1);
  var keys = [...e.keys()];
  assert_eq_set(["name", "aka"], keys);
  var values = [...e.values()];
  assert_eq_set(["Ivan", ["X", "Y"]], values);
  var entries = [...e.entries()];
  assert_eq_set([["name", "Ivan"], ["aka", ["X", "Y"]]], entries);
  var entries2 = [...e];
  assert_eq_set(entries, entries2);
}

function test_pull() {
  var schema = {"father":   {":db/valueType":   ":db.type/ref"},
                "children": {":db/valueType":   ":db.type/ref",
                             ":db/cardinality": ":db.cardinality/many"}};
  var db = d.db_with(d.empty_db(schema),
                         [{":db/id": 1,   "name": "Ivan", "children": [10]},
                          {":db/id": 10,  "father":   1, "children": [100, 101]},
                          {":db/id": 100, "father":   10},
                          {":db/id": 101, "father":   10}]);

  var actual, expected;

  actual   = d.pull(db, '["children"]', 1);
  expected = {"children": [{":db/id": 10}]};
  assert_eq(expected, actual);

  actual   = d.pull(db, '["children", {"father" ["name" :db/id]}]', 10);
  expected = {"children": [{":db/id": 100}, {":db/id": 101}],
              "father": {"name": "Ivan", ":db/id": 1}};
  assert_eq(expected, actual);
}

function test_lookup_refs() {
  var schema = {"name": {":db/unique": ":db.unique/identity"}};
  var db = d.db_with(d.empty_db(schema),
                     [{":db/id": 1, "name": "Ivan", "age": 18},
                      {":db/id": 2, "name": "Oleg", "age": 32}]);
  // entity
  assert_eq("Ivan", d.entity(db, ["name", "Ivan"]).get("name"));
  // pull
  assert_eq({"name": "Ivan"}, d.pull(db, '["name"]', ["name", "Ivan"]));
  assert_eq_set(
    [{"name": "Ivan"}, {"name": "Oleg"}],
    d.pull_many(db, '["name"]', [["name", "Ivan"], ["name", "Oleg"]])
  );
  // index access
  assert_eq_datoms([[1, "age", 18, tx0+1],
                    [1, "name", "Ivan", tx0+1]],
                   d.datoms(db, ":eavt", ["name", "Ivan"]));
  // queries
  assert_eq([[["name", "Ivan"], 18]], 
            d.q('[:find ?e ?a\
                  :in $ ?e \
                  :where [?e "age" ?a]]', db, ["name", "Ivan"]));
}

function test_resolve_current_tx() {
  var schema = {"created-at": {":db/valueType": ":db.type/ref"}};
  var conn = d.create_conn(schema);
  var tx_report = d.transact(conn, [{"name": "X", "created-at": ":db/current-tx"},
                                    {":db/id": ":db/current-tx", "prop1": "val1"},
                                    [":db/add", ":db/current-tx", "prop2", "val2"],
                                    [":db/add", -1, "name", "Y"],
                                    [":db/add", -1, "created-at", ":db/current-tx"]]);
  var tx = tx_report.tempids[":db/current-tx"];
  assert_eq(tx0+1, tx);
  assert_eq_datoms(
    [[1, "created-at", tx,     tx],
     [1, "name",       "X",    tx],
     [2, "created-at", tx,     tx],
     [2, "name",       "Y",    tx],
     [tx, "prop1",     "val1", tx],
     [tx, "prop2",     "val2", tx]],
    d.datoms(d.db(conn), ":eavt"));
}


var people_db = d.db_with(d.empty_db({"age": {":db/index": true}}),
                 [{ ":db/id": 1, "name": "Ivan", "age": 15 },
                  { ":db/id": 2, "name": "Petr", "age": 37 },
                  { ":db/id": 3, "name": "Ivan", "age": 37 }]);

function test_q_coll() {
  assert_eq_set([[1, "Ivan"], [2, "Petr"], [3, "Ivan"]],
                d.q('[:find ?e ?name \
                      :in   $ [?name ...] \
                      :where [?e "name" ?name]]',
                    people_db,
                    ["Ivan", "Petr"]));
  
  assert_eq_set([[1], [2]],
                d.q('[:find ?x \
                      :in   [?x ...] \
                      :where [(pos? ?x)]]',
                    [-2, -1, 0, 1, 2]));
}

function test_q_relation() {
  var res = d.q('[:find ?e ?email \
                  :in    $ $b \
                  :where [?e "name" ?n] \
                         [$b ?n ?email]]',
                people_db,
               [["Ivan", "ivan@mail.ru"],
                ["Petr", "petr@gmail.com"]]);
  assert_eq_set([[1, "ivan@mail.ru"], [2, "petr@gmail.com"], [3, "ivan@mail.ru"]], res);

  res     = d.q('[:find ?e ?email \
                  :in    $ [[?n ?email]] \
                  :where [?e "name" ?n]]',
                people_db,
               [["Ivan", "ivan@mail.ru"],
                ["Petr", "petr@gmail.com"]]);
  assert_eq_set([[1, "ivan@mail.ru"], [2, "petr@gmail.com"], [3, "ivan@mail.ru"]], res);
}

function test_q_rules() {
  var res = d.q('[:find ?e1 ?e2 \
                  :in    $ % \
                  :where (mate ?e1 ?e2) \
                         [(< ?e1 ?e2)]]',
                people_db,
                '[[(mate ?e1 ?e2)   \
                   [?e1 "name" ?n]  \
                   [?e2 "name" ?n]] \
                  [(mate ?e1 ?e2)   \
                   [?e1 "age" ?a]   \
                   [?e2 "age" ?a]]]');
  assert_eq_set([[1, 3], [2, 3]], res);
}

function test_q_fns() {
  var res = d.q('[:find ?e \
                  :in    $ ?adult \
                  :where [?e "age" ?a] \
                         [(?adult ?a)]]',
                people_db,
                function(a) { return a > 18; });
  assert_eq_set([[2], [3]], res);
}

function test_find_specs() {
  var res = d.q('[:find [?name ...] \
                  :where [_ "name" ?name]]',
                people_db);
  assert_eq(["Ivan", "Petr"], res);
  
  var res = d.q('[:find [?name ?age] \
                  :where [1 "name" ?name] \
                         [1 "age" ?age]]',
                people_db);
  assert_eq(["Ivan", 15], res);
  
  var res = d.q('[:find ?name . \
                  :where [1 "name" ?name]]',
                people_db);
  assert_eq("Ivan", res);
}

function test_datoms() {
  assert_eq_datoms([[1, "age", 15, tx0+1],
                    [1, "name", "Ivan", tx0+1]],
                   d.datoms(people_db, ":eavt", 1));
  
  assert_eq_datoms([[1, "age", 15, tx0+1]],
                   d.datoms(people_db, ":eavt", 1, "age"));
  
  assert_eq_datoms([[2, "age", 37, tx0+1],
                    [3, "age", 37, tx0+1]],
                   d.seek_datoms(people_db, ":avet", "age", 20));
}

function test_filter() {
  assert_eq_set([[1, "name", "Ivan"],
                 [2, "name", "Petr"],
                 [3, "name", "Ivan"]],
                d.q("[:find ?e ?a ?v :where [?e ?a ?v]]",
                    d.filter(people_db,
                             function(db,datom) { return datom.a == "name"; })));
  
  assert_eq_set([[1, "name", "Ivan"],
                 [1, "age", 15]],
                d.q("[:find ?e ?a ?v :where [?e ?a ?v]]",
                    d.filter(people_db,
                             function(db,datom) { 
                               var entity = d.entity(db, datom.e);
                               return entity.get("age") <= 18;
                             })));
}

function test_upsert() {
  var schema = {
    ":my/tid": {
      ":db/unique": ":db.unique/identity"
    }
  };
  var conn = d.create_conn(schema);
  d.transact(conn, [{
    ":my/tid": "5x",
    ":my/name": "Terin"
  }]);

  d.transact(conn, [{
    ":my/tid": "5x",
    ":my/name": "Charlie"
  }]);

  var names = d.q('[:find ?name :where [?e ":my/tid" "5x"] [?e ":my/name" ?name]]', d.db(conn));
  assert_eq_set([["Charlie"]], names);
}

function test_serialize() {
  var schema = {
    ":my/tid": {
      ":db/unique": ":db.unique/identity"
    }
  };
  var conn = d.create_conn(schema);
  d.transact(conn, [{":my/email": "a", ":my/name": "A"}]);
  d.transact(conn, [{":my/email": "b", ":my/name": "B"}]);
  var db = d.db(conn);

  assert_eq_set(
    [[1, ":my/email", "a"], [1, ":my/name", "A"], [2, ":my/email", "b"], [2, ":my/name", "B"]],
    d.q('[:find ?e ?a ?v :where [?e ?a ?v]]', db)
  );

  var json = JSON.stringify(d.serializable(db));
  var db2 = d.from_serializable(JSON.parse(json));

  assert_eq_set(
    [[1, ":my/email", "a"], [1, ":my/name", "A"], [2, ":my/email", "b"], [2, ":my/name", "B"]],
    d.q('[:find ?e ?a ?v :where [?e ?a ?v]]', db2)
  );

  assert_eq_set(
    [[1, "A"], [2, "B"]],
    d.q('[:find ?e ?v :where [?e ":my/name" ?v]]', db2)
  );
}


function test_datascript_js() {
  return test_fns([ test_db_with,
                    test_nested_maps,
                    test_init_db,
                    test_dbfn_call,
                    test_schema,
                    test_tuple,
                    test_hetero_tuple,
                    test_homo_tuple,
                    test_tuple_schema_errors,
                    test_tuple_refs,
                    test_tuple_unique,
                    test_tuple_index,
                    test_tuple_read_refs,
                    test_tuple_many,
                    test_tuple_cas,
                    test_tuple_serialize,
                    test_tx_report,
                    test_conn,
                    test_entity,
                    test_entity_refs,
                    test_entity_iterators,
                    test_pull,
                    test_lookup_refs,
                    test_resolve_current_tx,
                    test_q_coll,
                    test_q_relation,
                    test_q_rules,
                    test_q_fns,
                    test_find_specs,
                    test_datoms,
                    test_filter,
                    test_upsert,
                    test_serialize,
                  ]);
}

module.exports = { "test_all": test_datascript_js };
