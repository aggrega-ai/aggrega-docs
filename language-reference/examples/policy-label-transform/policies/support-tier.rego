# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.
#
# Attached at label-transform. Writes two labels from the Release's environment:
#
#   ops.example.com/environment   on every node, the environment as the Release
#                                 names it, so that a policy over the build
#                                 graph, whose payload carries no environment,
#                                 can read it;
#   ops.example.com/support-tier  on every node whose Component's category the
#                                 supported_categories setting lists, the tier
#                                 the support_tiers setting gives the
#                                 environment.
#
# The nodes are at input.graph.nodes here; a policy attached at ir-verdict reads
# them at input.graph.spec.nodes instead.
package support_tier

import rego.v1

env := input.compilation_context.environment

labels contains {"node": id, "key": "ops.example.com/environment", "value": env} if {
    some id, _ in input.graph.nodes
}

labels contains {"node": id, "key": "ops.example.com/support-tier", "value": data.support_tiers[env]} if {
    some id, node in input.graph.nodes
    node.labels["component.aggrega.ai/category"] in data.supported_categories
}
