# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.

# The control for the rule in policy.rego, and the reason that rule needs the
# per-leaf marking.
#
# This one asks the whole-attachment question instead: is this attachment
# sensitive at all? That answer is true whenever the slot being filled is
# declared sensitive, whoever fills it and whatever they author — so this rule
# refuses both releases in this workspace, including the one that authors
# nothing. Attach it in place of policy.rego to see that happen.
package house.governance

import rego.v1

deny contains msg if {
	some node_id, attachments in input.graph.spec.feature_values_mapping
	some attachment_name, attachment in attachments
	attachment.sensitive
	msg := sprintf("%v: the %v credential handles sensitive material", [node_id, attachment_name])
}
