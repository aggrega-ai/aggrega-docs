# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# Attached at ir-verdict. Halts a build in which a node labelled as built for
# production carries no support tier. Both labels are written by the
# label-transform policy in support-tier.rego, which runs before this one; the
# graph this role receives carries no environment of its own.
package production_support

import rego.v1

deny contains msg if {
    some id, node in input.graph.spec.nodes
    node.labels["ops.example.com/environment"] == "production"
    not node.labels["ops.example.com/support-tier"]
    msg := sprintf("%v is built for production and carries no ops.example.com/support-tier label", [id])
}
