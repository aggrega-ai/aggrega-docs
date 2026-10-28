# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Cognitio S.r.l.

# Gives every component the platform's monitoring and an IAM role, by injecting
# the two annotations the Manifest binds. A component that already carries one
# of them keeps its own value.
package platform

import rego.v1

monitoring := "feature.aggrega.ai/monitoring"

role := "aws-role"

# The monitoring binding routes three subkeys, so its value is an object
# naming each.
annotations contains {
    "boundary_path": t.boundary_path,
    "component_name": t.component_name,
    "annotation_key": monitoring,
    "annotation_value": {"interval": "30s", "port": "metrics", "path": "/metrics"},
} if {
    monitoring in input.binding_keys
    some t in input.targets
    not monitoring in object.keys(t.annotations)
}

# The role binding routes one subkey, so its value is a string: a role per
# component, named after it.
annotations contains {
    "boundary_path": t.boundary_path,
    "component_name": t.component_name,
    "annotation_key": role,
    "annotation_value": sprintf("arn:aws:iam::123456789012:role/shop-%v", [t.component_name]),
} if {
    role in input.binding_keys
    some t in input.targets
    not role in object.keys(t.annotations)
}
