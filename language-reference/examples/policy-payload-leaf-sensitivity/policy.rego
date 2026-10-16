# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.

# A house rule: no credential slot is filled by writing the material into the
# deployment's own source.
#
# The rule reads the per-leaf marking, which names each leaf an attachment's
# payload carries AND whose Feature declares that leaf sensitive. A leaf the
# Feature leaves unmarked never appears, so an attachment that writes a key name
# beside a password is refused over the password alone.
package house.governance

import rego.v1

deny contains msg if {
	some node_id, attachments in input.graph.spec.feature_values_mapping
	some attachment_name, attachment in attachments
	some leaf in attachment.sensitive_payload_leaves
	msg := sprintf("%v: the %v credential carries declared-sensitive material in its payload at %v", [node_id, attachment_name, leaf])
}
