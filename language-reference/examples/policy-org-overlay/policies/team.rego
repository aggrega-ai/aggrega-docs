# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# The team's own rule, attached at ir-verdict in .aggrega-config.yaml. It
# collects under warn, which the attachment reports at the warn severity: the
# build completes and prints the message.
package team

import rego.v1

warn contains msg if {
    some id, node in input.graph.spec.nodes
    node.labels["component.aggrega.ai/category"] == "datastore"
    input.graph.spec.infra_mapping[id].ha.enabled == false
    msg := sprintf("%v runs with high availability off", [id])
}
