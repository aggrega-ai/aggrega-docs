# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.

# A planted mistake: the monitoring binding routes three subkeys, and this
# policy injects a string under its key, which names none of them. The build
# halts on it, naming this plugin and the role it is attached at.
package platform

import rego.v1

monitoring := "feature.aggrega.ai/monitoring"

annotations contains {
    "boundary_path": t.boundary_path,
    "component_name": t.component_name,
    "annotation_key": monitoring,
    "annotation_value": "30s",
} if {
    monitoring in input.binding_keys
    some t in input.targets
    not monitoring in object.keys(t.annotations)
}
