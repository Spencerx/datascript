#!/bin/bash
set -o errexit -o nounset -o pipefail
cd "`dirname $0`/.."

clojure -Sdeps '{:deps {nrepl/nrepl {:mvn/version "1.3.1"}}}' -M:1.12:dev -m nrepl.cmdline
