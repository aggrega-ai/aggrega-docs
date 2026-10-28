# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# The organization's rule, attached at ir-verdict twice: in org/config.yaml,
# where its translation reports deny at warn, and in the pipeline's
# .aggrega-config-append-ci.yaml, where its translation reports deny at halt.
# The categories it refuses are the attachment's settings, read here as data.
package estate

import rego.v1

deny contains msg if {
    some id, node in input.graph.spec.nodes
    category := node.labels["component.aggrega.ai/category"]
    category in data.refused_categories
    msg := sprintf("%v runs %v, in the %v category, which the organization does not ship", [id, node.component, category])
}

audit contains msg if {
    some id, node in input.graph.spec.nodes
    msg := sprintf("%v runs %v %v, upstream licensing %v", [id, node.component, node.resolved_version, node.labels["component.aggrega.ai/upstream-licensing"]])
}
